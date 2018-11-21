pragma solidity 0.4.25;

import "SafeMath.sol";
import "ERC20.sol";
import "GuildBank.sol";
import "LootToken.sol";

contract Moloch {
    using SafeMath for uint256;

    /***************
    GLOBAL CONSTANTS
    ***************/
    uint256 public periodDuration; // default = 86400 = 1 day in seconds
    uint256 public votingPeriodLength; // default = 7 periods
    uint256 public gracePeriodLength; // default = 7 periods
    uint256 public proposalDeposit; // default = $5,000 worth of ETH at contract deployment (units in Wei)

    GuildBank public guildBank; // guild bank contract reference
    LootToken public lootToken; // loot token contract reference

    uint8 public constant QUORUM_NUMERATOR = 1;
    uint8 public constant QUORUM_DENOMINATOR = 2;

    /***************
    EVENTS
    ***************/
    event AddMember(address member);
    event SubmitProposal(uint256 index, address indexed applicant, address indexed memberAddress);
    event ProcessProposal(uint256 index, address indexed applicant, address indexed proposer, Result result);
    event SubmitVote(address sender, address indexed memberAddress, uint256 proposalIndex, uint8 uintVote);

    /******************
    INTERNAL ACCOUNTING
    ******************/
    uint256 public currentPeriod = 0; // the current period number
    uint256 public pendingProposals = 0; // the # of proposals waiting to be voted on
    uint256 public totalVotingShares = 0; // total voting shares across all members

    enum Vote {
        Null, // default value, counted as abstention
        Yes,
        No
    }

    enum Result {
        Null, // default value, counted as abstention
        AddedVotingShares,
        AddedNewMember,
        Failed
    }

    struct Member {
        address delegateKey; // the key responsible for submitting proposals and voting - defaults to member address unless updated
        uint256 votingShares; // the # of voting shares assigned to this member
        bool isActive; // always true once a member has been created
        mapping (uint256 => Vote) votesByProposal; // records a member's votes by the index of the proposal
    }

    struct Proposal {
        address proposer; // the member who submitted the proposal
        address applicant; // the applicant who wishes to become a member - this key will be used for withdrawals
        uint256 votingSharesRequested; // the # of voting shares the applicant is requesting
        uint256 startingPeriod; // the period in which voting can start for this proposal
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        bool processed; // true only if the proposal has been processed
        address[] tributeTokenAddresses; // the addresses of the tokens the applicant has offered as tribute
        uint256[] tributeTokenAmounts; // the amounts of the tokens the applicant has offered as tribute
        mapping (address => Vote) votesByMember; // the votes on this proposal by each member
    }

    struct Period {
        uint256 startTime; // the starting unix timestamp in seconds
        uint256 endTime; // the ending unix timestamp in seconds
    }

    mapping (address => Member) public members;
    mapping (address => address) public memberAddressByDelegateKey;
    mapping (uint256 => Period) public periods;
    Proposal[] public proposalQueue;

    /********
    MODIFIERS
    ********/
    modifier onlyMember {
        require(members[msg.sender].votingShares > 0, "Moloch::onlyMember - not a member");
        _;
    }

    modifier onlyMemberDelegate {
        require(members[memberAddressByDelegateKey[msg.sender]].votingShares > 0, "Moloch::onlyMemberDelegate - not a member");
        _;
    }

    /********
    FUNCTIONS
    ********/

    //AUSTIN COMMENT: THIS IS FOR EASE OF TESTING REMOVE WHEN READY
    address public deployer;//used for simple debugging

    constructor(
        address guildBankAddress,
        address[] foundersAddresses,
        uint256[] foundersVotingShares,
        uint256 _periodDuration,
        uint256 _votingPeriodLength,
        uint256 _gracePeriodLength,
        uint _proposalDeposit
    )
        public
    {
        lootToken = new LootToken();
        guildBank = GuildBank(guildBankAddress);

        //AUSTIN COMMENT: THIS IS FOR EASE OF TESTING REMOVE WHEN READY
        deployer=msg.sender;

        periodDuration = _periodDuration;
        votingPeriodLength = _votingPeriodLength;
        gracePeriodLength = _gracePeriodLength;
        proposalDeposit = _proposalDeposit;

        uint256 startTime = now;
        periods[currentPeriod].startTime = startTime;
        periods[currentPeriod].endTime = startTime.add(periodDuration);

        _addFoundingMembers(foundersAddresses, foundersVotingShares);
    }

    function _addFoundingMembers(
        address[] membersArray,
        uint256[] sharesArray
    )
        internal
    {
        require(membersArray.length == sharesArray.length, "Moloch::_addFoundingMembers - Provided arrays should match up.");
        for (uint i = 0; i < membersArray.length; i++) {
            address founder = membersArray[i];
            uint256 shares = sharesArray[i];

            require(shares > 0, "Moloch::_addFoundingMembers - founding member has 0 shares");
            require(!members[founder].isActive, "Moloch::_addFoundingMembers - duplicate founder");

            // use the founder address as the delegateKey by default
            members[founder] = Member(founder, shares, true);
            emit AddMember(founder);
            memberAddressByDelegateKey[founder] = founder;
            totalVotingShares = totalVotingShares.add(shares);
            lootToken.mint(this, shares);
        }
    }

    function updatePeriod() public {
        while (now >= periods[currentPeriod].endTime) {
            Period memory prevPeriod = periods[currentPeriod];
            currentPeriod += 1;
            periods[currentPeriod].startTime = prevPeriod.endTime;
            periods[currentPeriod].endTime = prevPeriod.endTime.add(periodDuration);

            if (pendingProposals > 0) {
                pendingProposals = pendingProposals.sub(1);
            }
        }
    }

    /*****************
    PROPOSAL FUNCTIONS
    *****************/

    function submitProposal(
        address applicant,
        address[] tributeTokenAddresses,
        uint256[] tributeTokenAmounts,
        uint256 votingSharesRequested
    )
        public
        payable
        onlyMemberDelegate
    {
        updatePeriod();

        address memberAddress = memberAddressByDelegateKey[msg.sender];

        require(memberAddress == applicant || !members[applicant].isActive, "Moloch::submitProposal - applicant is an active member besides the proposer");
        require(msg.value == proposalDeposit, "Moloch::submitProposal - insufficient proposalDeposit");
        require(votingSharesRequested > 0, "Moloch::submitProposal - votingSharesRequested is zero");

        for (uint256 i = 0; i < tributeTokenAddresses.length; i++) {
            ERC20 token = ERC20(tributeTokenAddresses[i]);
            uint256 amount = tributeTokenAmounts[i];
            require(amount > 0, "Moloch::submitProposal - token tribute amount is 0");
            require(token.transferFrom(applicant, this, amount), "Moloch::submitProposal - tribute token transfer failed");
        }


        pendingProposals = pendingProposals.add(1);
        uint256 startingPeriod = currentPeriod + pendingProposals;

        Proposal memory proposal = Proposal(memberAddress, applicant, votingSharesRequested, startingPeriod, 0, 0, false, tributeTokenAddresses, tributeTokenAmounts);

        SubmitProposal(proposalQueue.push(proposal)-1,applicant,memberAddress);
    }


    function submitVote(uint256 proposalIndex, uint8 uintVote) public onlyMemberDelegate {
        updatePeriod();

        address memberAddress = memberAddressByDelegateKey[msg.sender];

        Proposal storage proposal = proposalQueue[proposalIndex];
        Vote vote = Vote(uintVote);
        require(proposal.startingPeriod > 0, "Moloch::submitVote - proposal does not exist");
        require(currentPeriod >= proposal.startingPeriod, "Moloch::submitVote - voting period has not started");
        require(currentPeriod.sub(proposal.startingPeriod) < votingPeriodLength, "Moloch::submitVote - proposal voting period has expired");
        require(proposal.votesByMember[memberAddress] == Vote.Null, "Moloch::submitVote - member has already voted on this proposal");
        require(vote == Vote.Yes || vote == Vote.No, "Moloch::submitVote - vote must be either Yes or No");
        proposal.votesByMember[memberAddress] = vote;

        Member storage member = members[memberAddress];
        member.votesByProposal[proposalIndex] = vote;

        //AUSTIN COMMENT: these weren't incrementing correctly so I updated it to
        // change the values in storage
        if (vote == Vote.Yes) {
            proposal.yesVotes = proposal.yesVotes.add(member.votingShares);
        } else if (vote == Vote.No) {
            proposal.noVotes = proposal.noVotes.add(member.votingShares);
        }

        emit SubmitVote(msg.sender, memberAddress, proposalIndex, uintVote);
    }

    function processProposal(uint256 proposalIndex) public {
        updatePeriod();

        Proposal storage proposal = proposalQueue[proposalIndex];
        require(proposal.startingPeriod > 0, "Moloch::processProposal - proposal does not exist");
        require(currentPeriod.sub(proposal.startingPeriod) > votingPeriodLength.add(gracePeriodLength), "Moloch::processProposal - proposal is not ready to be processed");
        require(proposal.processed == false, "Moloch::processProposal - proposal has already been processed");

        proposal.processed = true;

        Result result = Result.Null;

        if (proposal.yesVotes.add(proposal.noVotes) >= (totalVotingShares.mul(QUORUM_NUMERATOR)).div(QUORUM_DENOMINATOR) && proposal.yesVotes > proposal.noVotes) {

            // if the proposer is the applicant, add to their existing voting shares
            if (proposal.proposer == proposal.applicant) {

                members[proposal.applicant].votingShares = members[proposal.applicant].votingShares.add(proposal.votingSharesRequested);

                uint256 currentProposalIndex = proposalQueue.length.sub(pendingProposals.add(1));

                uint oldestActiveProposal = 0;
                if (currentProposalIndex > votingPeriodLength.add(gracePeriodLength)) {
                    oldestActiveProposal = currentProposalIndex.sub(votingPeriodLength).sub(gracePeriodLength);
                }

                // loop over their active proposal votes and add the new voting shares to any YES or NO votes
                for (uint256 i = currentProposalIndex; i > oldestActiveProposal; i--) {
                    if (isActiveProposal(i)) {
                        if(i!=proposalIndex) {//don't update the votes for the current propsal even if we already counted the votes (because it could possibly look wrong looking back at the count)
                          Proposal storage activeProposal = proposalQueue[i];
                          Vote vote = activeProposal.votesByMember[proposal.applicant];

                          if (vote == Vote.Null) {
                              // member didn't vote on this proposal, skip to the next one
                              continue;
                          } else if (vote == Vote.Yes) {
                              activeProposal.yesVotes = activeProposal.yesVotes.add(proposal.votingSharesRequested);
                          } else {
                              activeProposal.noVotes = activeProposal.noVotes.add(proposal.votingSharesRequested);
                          }
                        }
                    } else {
                        // reached inactive proposal, exit the loop
                        break;
                    }
                }
                result=Result.AddedVotingShares;
            // the applicant is a new member, create a new record for them
            } else {
                // use applicant address as delegateKey by default
                members[proposal.applicant] = Member(proposal.applicant, proposal.votingSharesRequested, true);
                emit AddMember(proposal.applicant);
                memberAddressByDelegateKey[proposal.applicant] = proposal.applicant;
                result=Result.AddedNewMember;
            }

            // mint new voting shares and loot tokens
            totalVotingShares = totalVotingShares.add(proposal.votingSharesRequested);
            lootToken.mint(this, proposal.votingSharesRequested);

            // deposit all tribute tokens to guild bank
            for (uint256 j; j < proposal.tributeTokenAddresses.length; j++) {
              ERC20 tributeToken = ERC20(proposal.tributeTokenAddresses[j]);
              tributeToken.approve(address(guildBank),proposal.tributeTokenAmounts[j]);
              require(guildBank.depositTributeTokens(this, proposal.tributeTokenAddresses[j], proposal.tributeTokenAmounts[j]));
            }
        } else {
            // return all tokens
            for (uint256 k; k < proposal.tributeTokenAddresses.length; k++) {
                ERC20 token = ERC20(proposal.tributeTokenAddresses[k]);
                require(token.transfer(proposal.applicant, proposal.tributeTokenAmounts[k]));
            }
            result=Result.Failed;
        }

        proposal.proposer.transfer(proposalDeposit);
        emit ProcessProposal(proposalIndex, proposal.applicant, proposal.proposer,result);
    }


    event CollectLootTokens(address treasury, uint256 lootAmount);
    function collectLootTokens(address treasury, uint256 lootAmount) public onlyMember {
        updatePeriod();

        Member storage member = members[msg.sender];

        require(member.votingShares >= lootAmount, "Moloch::collectLoot - insufficient voting shares");

        member.votingShares = member.votingShares.sub(lootAmount);
        totalVotingShares = totalVotingShares.sub(lootAmount);

        require(lootToken.transfer(treasury, lootAmount), "Moloch::collectLoot - loot token transfer failure");

        emit CollectLootTokens(treasury,lootAmount);

        // loop over their active proposal votes:
        // - make sure they haven't voted YES on any active proposals
        // - update any active NO votes to reflect their new voting power.
        uint256 currentProposalIndex = 0;
        if(proposalQueue.length > pendingProposals){
            currentProposalIndex = proposalQueue.length.sub(pendingProposals.add(1));
        }
        uint256 oldestActiveProposal = 0;
        if(currentProposalIndex >= votingPeriodLength+gracePeriodLength){
            oldestActiveProposal = (currentProposalIndex.sub(votingPeriodLength)).sub(gracePeriodLength);
        }
        //AUSTIN COMMENT: I think this needs to be >= what if there is a single propsal
        for (uint256 i = currentProposalIndex; i >= oldestActiveProposal; i--) {
            if (isActiveProposal(i)) {
                Proposal storage proposal = proposalQueue[i];
                Vote vote = member.votesByProposal[i];

                //AUSTIN COMMENT: this line is weird to me I think the logic or error message is wrong
                // I'm going to comment it out and write this a little differently...
                //require(vote != Vote.Yes, "Moloch::collectLoot - member voted YES on active proposal");
                //I'm changing the logic here to just subtract their vote no matter what
                //There is probably a reason why you don't want someone to rage quit with
                // an active yes vote, but I don't see it yet. I'm probably wrong.
                //I think they should be able to liquidate & revert their voting power
                // in any situation even if they have active yes votes

                if (vote == Vote.Null) {
                    // member didn't vote on this proposal, skip to the next one
                    continue;
                }else if (vote == Vote.No) {
                    // member voted No, revert the vote.
                    proposal.noVotes = proposal.noVotes.sub(lootAmount);
                }else{
                    // member voted Yes, revert the vote.
                    proposal.yesVotes = proposal.yesVotes.sub(lootAmount);
                }

                // if the member is collecting 100% of their loot, erase these vote completely
                if (lootAmount == member.votingShares) {
                    proposal.votesByMember[msg.sender] = Vote.Null;
                    member.votesByProposal[i] = Vote.Null;
                }
            } else {
                // reached inactive proposal, exit the loop
                break;
            }
        }
    }

    function updateDelegateKey(address newDelegateKey) public onlyMember {
        // newDelegateKey must be either the member's address or one not in use by any other members
        require(newDelegateKey == msg.sender || !members[memberAddressByDelegateKey[msg.sender]].isActive);
        Member storage member = members[msg.sender];
        memberAddressByDelegateKey[member.delegateKey] = address(0);
        memberAddressByDelegateKey[newDelegateKey] = msg.sender;
        member.delegateKey = newDelegateKey;
    }

    // returns true if proposal is either in voting or grace period
    function isActiveProposal(uint256 proposalIndex) internal view returns (bool) {
        //AUSTIN COMMENT: needed to add in a check here. if the the proposalIndex==0 then this
        // will revert when it tries to get the startingPeriod
        if(proposalQueue.length>proposalIndex){
            uint256 startingPeriod = proposalQueue[proposalIndex].startingPeriod;
            return (currentPeriod >= startingPeriod && currentPeriod.sub(startingPeriod) < votingPeriodLength.add(gracePeriodLength));
        }else{
            return false;
        }
    }
}
