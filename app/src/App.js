import React, { Component } from 'react';
import './App.css';
import { Metamask, Gas, ContractLoader, Transactions, Events, Scaler, Blockie, Address, Button } from "dapparatus"
import Web3 from 'web3';

const dividerSpan = {
  padding:4
}


class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      web3: false,
      account: false,
      gwei: 4,
      doingTransaction: false,
      applicant:"0x9319Bbb4e2652411bE15BB74f339b7F6218b2508",
      tributeTokenAddresses:"loading...",
      tributeTokenAmounts:"10",
      votingSharesRequested:"100",
      tokenApprovals: {},
      proposals: [],
    }
    setTimeout(this.poll.bind(this),500)
    setInterval(this.poll.bind(this),1500)
  }
  handleInput(e){
    let update = {}
    update[e.target.name] = e.target.value
    this.setState(update)
  }
  async poll() {
    if(this.state.contracts){
      let someCoinBalance = await this.state.contracts.SomeCoin.balanceOf(this.state.account).call()
      let currentPeriod = await this.state.contracts.Moloch.currentPeriod().call()
      let currentPeriodInformation = await this.state.contracts.Moloch.periods(currentPeriod).call()
      let pendingProposals = await this.state.contracts.Moloch.pendingProposals().call()
      let totalVotingShares = await this.state.contracts.Moloch.totalVotingShares().call()
      let tokenApprovals = this.state.tokenApprovals
      if(this.state.applicant && this.state.tributeTokenAddresses){
        let tokenContracts = this.state.tokenContracts
        let tokenContractsChanged = false
        if(!tokenContracts){
          tokenContracts = {}
          tokenContractsChanged=true
        }
        let tokenAddresses = this.state.tributeTokenAddresses.split(",")
        for(let a in tokenAddresses)
        {
            if(!tokenContracts[tokenAddresses[a]]){
              tokenContractsChanged=true
              tokenContracts[tokenAddresses[a]] = this.state.customLoader("SomeCoin",tokenAddresses[a])
            }
            tokenApprovals[tokenAddresses[a]] = await tokenContracts[tokenAddresses[a]].allowance(this.state.applicant,this.state.contracts.Moloch._address).call()
        }
        if(tokenContractsChanged){
          console.log("tokenContracts CHANGE:",tokenContracts)
          this.setState({tokenContracts})
        }
      }
      if(this.state.submitProposalEvents){
        let {proposals} = this.state
        for(let e in this.state.submitProposalEvents){
          let event = this.state.submitProposalEvents[e]
          //console.log("Loading proposal with index",event.index)
          let proposal = await this.state.contracts.Moloch.proposalQueue(event.index).call()
          //console.log("submitProposalEvent",proposal)//,proposal)
          proposals[event.index] = proposal
        }
        this.setState({proposals})
      }

      this.setState({someCoinBalance,currentPeriod,currentPeriodInformation,pendingProposals,totalVotingShares})
    }
  }
  render() {
    let {web3,account,contracts,tx,gwei,block,avgBlockTime,etherscan} = this.state
    let connectedDisplay = []
    let contractsDisplay = []
    if(web3){
      connectedDisplay.push(
       <Gas
         key="Gas"
         onUpdate={(state)=>{
           console.log("Gas price update:",state)
           this.setState(state,()=>{
             console.log("GWEI set:",this.state)
           })
         }}
       />
      )

      connectedDisplay.push(
        <ContractLoader
         key="ContractLoader"
         config={{DEBUG:true}}
         web3={web3}
         require={path => {return require(`${__dirname}/${path}`)}}
         onReady={async (contracts,customLoader)=>{
           console.log("contracts loaded",contracts)
           this.setState({
             customLoader: customLoader,
             contracts:contracts,
             tributeTokenAddresses:contracts.SomeCoin._address,
             proposalDeposit: await contracts.Moloch.proposalDeposit().call(),
             votingPeriodLength: await contracts.Moloch.votingPeriodLength().call(),
             gracePeriodLength: await contracts.Moloch.gracePeriodLength().call(),
             periodDuration: await contracts.Moloch.periodDuration().call(),
           },async ()=>{
             console.log("Contracts Are Ready:",this.state.contracts)

           })
         }}
        />
      )
      connectedDisplay.push(
        <Transactions
          key="Transactions"
          config={{DEBUG:false}}
          account={account}
          gwei={gwei}
          web3={web3}
          block={block}
          avgBlockTime={avgBlockTime}
          etherscan={etherscan}
          onReady={(state)=>{
            console.log("Transactions component is ready:",state)
            this.setState(state)
          }}
          onReceipt={(transaction,receipt)=>{
            // this is one way to get the deployed contract address, but instead I'll switch
            //  to a more straight forward callback system above
            console.log("Transaction Receipt",transaction,receipt)
          }}
        />
      )

      if(contracts){

        let approvals = []
        if(this.state.tributeTokenAmounts&&this.state.tributeTokenAddresses){
          let tokenAmounts = this.state.tributeTokenAmounts.split(",")
          let tokenAddresses = this.state.tributeTokenAddresses.split(",")
          for(let a in tokenAddresses)
          {
            approvals.push(
              <div id={a}>
                <Button size="1" onClick={()=>{
                  tx(this.state.tokenContracts[tokenAddresses[a]].approve(contracts.Moloch._address,tokenAmounts[a]),
                    80000,(receipt)=>{
                    console.log("receipt",receipt)
                  })
                }}>
                  Approve {tokenAmounts[a]}
                </Button>
                <Blockie
                 address={this.state.applicant}
                 config={{size:3}}
                /> approval for <Blockie
                 address={tokenAddresses[a]}
                 config={{size:3}}
                />: {this.state.tokenApprovals[tokenAddresses[a]]?this.state.tokenApprovals[tokenAddresses[a]]:0}

              </div>
            )
          }
        }

        let proposals = []
        for(let p in this.state.proposals){
          let proposal = this.state.proposals[p]
          console.log(proposal)

          let proposalButton = ""
          if(!proposal.processed){
            proposalButton =(
              <Button color="green" onClick={()=>{
                  tx(contracts.Moloch.processProposal(p),1500000,0,0,(receipt)=>{
                    console.log("receipt",receipt)
                  })
                }}>
                Process
              </Button>
            )
          }

          proposals.push(
            <div key={p}>
              <span style={dividerSpan}>
                {p}
              </span>
              <span style={dividerSpan}>
                 <Blockie
                  address={proposal.applicant}
                  config={{size:3}}
                 />
              </span>
              <span style={dividerSpan}>
                <Blockie
                 address={proposal.proposer}
                 config={{size:3}}
                />
              </span>
              <span style={dividerSpan}>
                no:{proposal.noVotes}
              </span>
              <span style={dividerSpan}>
                yes:{proposal.yesVotes}
              </span>
              <span style={dividerSpan}>
                shares:{proposal.votingSharesRequested}
              </span>
              <span style={dividerSpan}>
                startingPeriod:{proposal.startingPeriod}
              </span>

              {proposalButton}
            </div>
          )
        }

        contractsDisplay.push(
          <div key="UI" style={{padding:30}}>
            <h1>👹 Moloch Lurks</h1>
            <div>
              <Address
                {...this.state}
                address={contracts.Moloch._address}
              />
            </div>
            <div style={{margin:5}}>
              <span style={{padding:5}}>currentPeriod:{this.state.currentPeriod}</span>
              <span style={{padding:5}}>pendingProposals:{this.state.pendingProposals}</span>
              <span style={{padding:5}}>totalVotingShares:{this.state.totalVotingShares}</span>
            </div>
            <div style={{borderBottom:"1px solid #444444",margin:10}}>
              <Button color="orange" onClick={()=>{
                  tx(contracts.Moloch.updatePeriod(),1500000,0,0,(receipt)=>{
                    console.log("receipt",receipt)
                  })
                }}>
                updatePeriod()
              </Button>
              <span style={{padding:5}}>period start:{this.state.currentPeriodInformation?Math.round(Date.now()/1000-this.state.currentPeriodInformation.startTime)+"s":0}</span>
              <span style={{padding:5}}>period end:{this.state.currentPeriodInformation?Math.round(this.state.currentPeriodInformation.endTime-Date.now()/1000)+"s":0}</span>
            </div>
            <div style={{margin:20}}>
              <Address
                {...this.state}
                address={this.state.account}
              />
              ({this.state.someCoinBalance} <Blockie
               address={contracts.SomeCoin._address}
               config={{size:3}}
              />Coins)
            </div>
            <div style={{border:"1px solid #444444",margin:10,padding:10}}>
              <h3>Proposals:</h3>
              {proposals}
            </div>

            <div style={{border:"1px solid #444444",margin:10,padding:10}}>
              <h3>Submit Proposal:</h3>
                <div>
                  applicant:
                  <Blockie
                   address={this.state.applicant}
                   config={{size:3}}
                  /><input
                    style={{verticalAlign:"middle",width:400,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                    type="text" name="applicant" value={this.state.applicant} onChange={this.handleInput.bind(this)}
                  />
                </div>
                <div>
                  tributeTokenAddresses:
                  <input
                    style={{verticalAlign:"middle",width:400,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                    type="text" name="tributeTokenAddresses" value={this.state.tributeTokenAddresses} onChange={this.handleInput.bind(this)}
                  />
                </div>
                <div>
                  tributeTokenAmounts:
                  <input
                    style={{verticalAlign:"middle",width:400,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                    type="text" name="tributeTokenAmounts" value={this.state.tributeTokenAmounts} onChange={this.handleInput.bind(this)}
                  />
                </div>
                <div>
                  {approvals}
                </div>
                <div>
                  votingSharesRequested:
                  <input
                    style={{verticalAlign:"middle",width:400,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                    type="text" name="votingSharesRequested" value={this.state.votingSharesRequested} onChange={this.handleInput.bind(this)}
                  />
                </div>
                (Deposit {this.state.web3.utils.fromWei(this.state.proposalDeposit)} ETH)
              <Button size="2" color="green" onClick={()=>{
                  let maxGasLimit = 300000
                  let txData = 0
                  let value = this.state.proposalDeposit
                  tx(contracts.Moloch.submitProposal(
                    this.state.applicant,
                    this.state.tributeTokenAddresses.split(","),
                    this.state.tributeTokenAmounts.split(","),
                    this.state.votingSharesRequested
                  ),maxGasLimit,txData,value,(receipt)=>{
                    console.log("receipt",receipt)
                  })
                }}>
                Submit
              </Button>
            </div>
            <Events
              config={{hide:false}}
              contract={contracts.Moloch}
              eventName={"AddMember"}
              block={block}
              onUpdate={(eventData,allEvents)=>{
                console.log("EVENT DATA:",eventData)
                this.setState({addMemberEvents:allEvents})
              }}
            />
            <Events
              config={{hide:false}}
              contract={contracts.Moloch}
              eventName={"SubmitProposal"}
              block={block}
              onUpdate={(eventData,allEvents)=>{
                console.log("EVENT DATA:",eventData)
                this.setState({submitProposalEvents:allEvents})
              }}
            />
            <Events
              config={{hide:false}}
              contract={contracts.Moloch}
              eventName={"ProcessProposal"}
              block={block}
              onUpdate={(eventData,allEvents)=>{
                console.log("EVENT DATA:",eventData)
                this.setState({processProposalEvents:allEvents})
              }}
            />



          </div>
        )
      }

    }
    return (
      <div className="App">
        <Metamask
          config={{requiredNetwork:['Unknown','Rinkeby']}}
          onUpdate={(state)=>{
           console.log("metamask state update:",state)
           if(state.web3Provider) {
             state.web3 = new Web3(state.web3Provider)
             this.setState(state)
           }
          }}
        />
        {connectedDisplay}
        {contractsDisplay}
      </div>
    );
  }
}

export default App;
