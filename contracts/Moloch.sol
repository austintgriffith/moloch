/* TODO
 * Known issue - if several members ragequit they could potentially shift a proposal from NO to YES
 * - e.g. 10% YES, 15% NO, 75% Abstain -> 10% of the NO votes leave (could be ragequitting a separate proposal)
 * - result is 10% YES, 5% NO, so the vote passes
 * - We could address this by allowing users to still vote NO during the grace period (and only vote YES during voting period)
 * - but then basically people would only vote YES during voting, and NO during grace... think about this
 *
 * Test edge cases around increasing/decreasing voting shares of existing members wrt to proposal queue length
 *
 * Update the "result" event - talk to James first
 * - processProposal uses it
 * - could just add fields to processProposal event
 *
 * Remove "AddMembers" event - find another way to represent this
 *
 * New:
 *  - remove ERC20 support, ETH maximalism
 *    - removes looping over ERC20 tokens on deposit and withdrawal
 *    - alternative, only ETH + DAI is allowed
 */

pragma solidity 0.4.24;

import "./oz/SafeMath.sol";
import "./oz/ERC20.sol";
import "./GuildBank.sol";
import {LootToken} from "./LootToken.sol";

contract Moloch {
    using SafeMath for uint256;

    /***************
    GLOBAL CONSTANTS
    ***************/
    uint256 public periodDuration; // default = 86400 = 1 day in seconds
    uint256 public votingPeriodLength; // default = 7 periods
    uint256 public gracePeriodLength; // default = 7 periods
    uint256 public proposalDeposit; // default = 10 ETH (~$1,000 worth of ETH at contract deployment)

    GuildBank public guildBank; // guild bank contract reference
    LootToken public lootToken; // loot token contract reference

    /***************
    EVENTS
    ***************/
    event AddMember(address member);
    event SubmitProposal(uint256 index, address indexed applicant, address indexed memberAddress);
    event ProcessProposal(uint256 index, address indexed applicant, address indexed proposer, Result result);
    event SubmitVote(address sender, address indexed memberAddress, uint256 indexed proposalIndex, uint8 uintVote);

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
        uint256 canRagequitAfterBlock; // block # after which member can ragequit - set on vote
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

    bool isSummoned;

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

    modifier summoned {
        require(isSummoned, "Moloch::summoningComplete - summoning is still in progress");
    }

    /********
    FUNCTIONS
    ********/
    constructor(
        address lootTokenAddress,
        address guildBankAddress,
        uint256 _periodDuration,
        uint256 _votingPeriodLength,
        uint256 _gracePeriodLength,
        uint _proposalDeposit,
        address summoner
    )
        public
    {
        lootToken = LootToken(lootTokenAddress);
        guildBank = GuildBank(guildBankAddress);
        periodDuration = _periodDuration;
        votingPeriodLength = _votingPeriodLength;
        gracePeriodLength = _gracePeriodLength;
        proposalDeposit = _proposalDeposit;

        uint256 startTime = now;
        periods[currentPeriod].startTime = startTime;
        periods[currentPeriod].endTime = startTime.add(periodDuration);

        members[summoner] = Member(summoner, 1, true);
        totalVotingShares = totalVotingShares.add(1);
        lootToken.mint(this, 1);
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
        summoningComplete
    {
        updatePeriod();

        address memberAddress = memberAddressByDelegateKey[msg.sender];

        require(msg.value == proposalDeposit, "Moloch::submitProposal - insufficient proposalDeposit");

        for (uint256 i = 0; i < tributeTokenAddresses.length; i++) {
            ERC20 token = ERC20(tributeTokenAddresses[i]);
            uint256 amount = tributeTokenAmounts[i];
            require(amount > 0, "Moloch::submitProposal - token tribute amount is 0");
            require(token.transferFrom(applicant, this, amount), "Moloch::submitProposal - tribute token transfer failed");
        }

        pendingProposals = pendingProposals.add(1);
        uint256 startingPeriod = currentPeriod + pendingProposals;

        Proposal memory proposal = Proposal({
            proposer: memberAddress,
            applicant: applicant,
            votingSharesRequested: votingSharesRequested,
            startingPeriod: startingPeriod,
            yesVotes: 0,
            noVotes: 0,
            processed: false,
            tributeTokenAddresses: tributeTokenAddresses,
            tributeTokenAmounts: tributeTokenAmounts
        });

        emit SubmitProposal(proposalQueue.push(proposal)-1, applicant,memberAddress);
    }

    function submitVote(
        uint256 proposalIndex,
        uint8 uintVote
    )
        public
        onlyMemberDelegate
        summoningComplete
    {
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

        if (vote == Vote.Yes) {
            proposal.yesVotes = proposal.yesVotes.add(member.votingShares);
        } else if (vote == Vote.No) {
            proposal.noVotes = proposal.noVotes.add(member.votingShares);
        }

        uint256 endingPeriod = proposal.startingPeriod.add(votingPeriodLength).add(gracePeriodLength);

        if (endingPeriod > member.canRagequitAfterBlock) {
            member.canRagequitAfterBlock = endingPeriod;
        }

        emit SubmitVote(msg.sender, memberAddress, proposalIndex, uintVote);
    }

    function processProposal(uint256 proposalIndex) public summoningComplete {
        updatePeriod();

        Proposal storage proposal = proposalQueue[proposalIndex];
        require(proposal.startingPeriod > 0, "Moloch::processProposal - proposal does not exist");
        require(currentPeriod.sub(proposal.startingPeriod) > votingPeriodLength.add(gracePeriodLength), "Moloch::processProposal - proposal is not ready to be processed");
        require(proposal.processed == false, "Moloch::processProposal - proposal has already been processed");

        proposal.processed = true;

        Result result = Result.Null;

        // PROPOSAL PASSED
        if (proposal.yesVotes > proposal.noVotes) {

            // if the proposer is already a member, add to their existing voting shares
            if (members[proposal.applicant].votingShares > 0) {

                members[proposal.applicant].votingShares = members[proposal.applicant].votingShares.add(proposal.votingSharesRequested);
                result = Result.AddedVotingShares;

            // the applicant is a new member, create a new record for them
            } else {
                // use applicant address as delegateKey by default
                members[proposal.applicant] = Member(proposal.applicant, proposal.votingSharesRequested, true);
                memberAddressByDelegateKey[proposal.applicant] = proposal.applicant;
                result = Result.AddedNewMember;
                emit AddMember(proposal.applicant);
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

        // PROPOSAL FAILED
        } else {
            // return all tokens
            for (uint256 k; k < proposal.tributeTokenAddresses.length; k++) {
                ERC20 token = ERC20(proposal.tributeTokenAddresses[k]);
                require(token.transfer(proposal.applicant, proposal.tributeTokenAmounts[k]));
            }
            result = Result.Failed;
        }

        proposal.proposer.transfer(proposalDeposit);
        emit ProcessProposal(proposalIndex, proposal.applicant, proposal.proposer,result);
    }


    function collectLootTokens(
        address treasury,
        uint256 lootAmount
    )
        public
        onlyMember
        summoningComplete
    {
        updatePeriod();

        Member storage member = members[msg.sender];

        require(member.votingShares >= lootAmount, "Moloch::collectLoot - insufficient voting shares");

        member.votingShares = member.votingShares.sub(lootAmount);
        totalVotingShares = totalVotingShares.sub(lootAmount);

        require(lootToken.transfer(treasury, lootAmount), "Moloch::collectLoot - loot token transfer failure");

        require(currentPeriod > member.canRagequitAfterBlock, "Moloch::collectLoot - can't ragequit yet");
    }

    function updateDelegateKey(address newDelegateKey) public onlyMember summoned {
        // newDelegateKey must be either the member's address or one not in use by any other members
        require(newDelegateKey == msg.sender || !members[memberAddressByDelegateKey[newDelegateKey]].isActive);
        Member storage member = members[msg.sender];
        memberAddressByDelegateKey[member.delegateKey] = address(0);
        memberAddressByDelegateKey[newDelegateKey] = msg.sender;
        member.delegateKey = newDelegateKey;
    }

    /***************
    GETTERS
    ***************/

    // returns true if proposal is either in voting or grace period
    function isActiveProposal(uint256 proposalIndex) internal view returns (bool) {
        if (proposalQueue.length>proposalIndex) {
            uint256 startingPeriod = proposalQueue[proposalIndex].startingPeriod;
            return (currentPeriod >= startingPeriod && currentPeriod.sub(startingPeriod) < votingPeriodLength.add(gracePeriodLength));
        } else {
            return false;
        }
    }

    function getProposalTokenAddress(uint256 proposalIndex, uint256 tokenIndex) external view returns (address) {
        return proposalQueue[proposalIndex].tributeTokenAddresses[tokenIndex];
    }

    function getProposalTokenAmount(uint256 proposalIndex, uint256 tokenIndex) external view returns (uint256) {
        return proposalQueue[proposalIndex].tributeTokenAmounts[tokenIndex];
    }

    function getProposalTokenLength(uint256 proposalIndex) external view returns (uint256) {
        return proposalQueue[proposalIndex].tributeTokenAddresses.length;
    }
}
