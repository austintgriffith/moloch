import React, { Component } from 'react';
import './App.css';
import { Metamask, Gas, ContractLoader, Transactions, Events, Blockie, Address, Button } from "dapparatus"
import Web3 from 'web3';

const dividerSpan = {
  padding:4
}


class App extends Component {
  constructor(props) {
    super(props);
    let pathParts = window.location.pathname.split("/")
    pathParts = pathParts.filter(Boolean)
    console.log("pathParts",pathParts)
    let molochContractAddress = ""
    if(pathParts[0]&&pathParts[0].length==42){
      molochContractAddress = pathParts[0]
    }
    this.state = {
      web3: false,
      account: false,
      gwei: 4,
      doingTransaction: false,
      applicant:"0x9319Bbb4e2652411bE15BB74f339b7F6218b2508",
      tributeTokenAddresses:"loading...",
      tributeTokenAmounts:"10000,500",
      votingSharesRequested:"100",
      tokenApprovals: {},
      tokenBalances: {},
      guildBankTokenBalances: {},
      proposals: [],
      members: [],
      molochContractAddress: molochContractAddress,
      deployfoundersAddresses:"0x2a906694d15df38f59e76ed3a5735f8aabcce9cb,0x9319Bbb4e2652411bE15BB74f339b7F6218b2508",
      deployfoundersVotingShares:"100,100",
      deployperiodDuration:"15",
      deployvotingPeriodLength:"3",
      deploygracePeriodLength:"3",
      deployproposalDeposit:"0.5",
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

      if(this.state.molochContractAddress){
        if(!this.state.molochContract){
          let molochContract = this.state.customLoader("Moloch",this.state.molochContractAddress)//new this.state.web3.eth.Contract(require("./contracts/BouncerProxy.abi.js"),this.state.address)
          this.setState({
            molochContract,
            proposalDeposit: await molochContract.proposalDeposit().call(),
            votingPeriodLength: await molochContract.votingPeriodLength().call(),
            gracePeriodLength: await molochContract.gracePeriodLength().call(),
            periodDuration: await molochContract.periodDuration().call(),
            applicant: this.state.account,
            QUORUM_NUMERATOR: await molochContract.QUORUM_NUMERATOR().call(),
            QUORUM_DENOMINATOR: await molochContract.QUORUM_DENOMINATOR().call(),
          },async ()=>{
            console.log("Moloch Is Ready:",molochContract)
            this.poll()
          })
        }else{
          let currentPeriod = await this.state.molochContract.currentPeriod().call()
          let currentPeriodInformation = await this.state.molochContract.periods(currentPeriod).call()
          let pendingProposals = await this.state.molochContract.pendingProposals().call()
          let totalVotingShares = await this.state.molochContract.totalVotingShares().call()
          let memberInformation = await this.state.molochContract.members(this.state.account).call()
          let tokenApprovals = this.state.tokenApprovals
          let tokenBalances = this.state.tokenBalances
          let lootTokenAddress = await this.state.molochContract.lootToken().call()
          if(!this.state.lootTokenContract){
            let lootTokenContract = this.state.customLoader("LootToken",lootTokenAddress)//new this.state.web3.eth.Contract(require("./contracts/BouncerProxy.abi.js"),this.state.address)
            this.setState({lootTokenContract})
          }
          let guildBankAddress = await this.state.molochContract.guildBank().call()
          if(!this.state.guildBankContract){
            let guildBankContract = this.state.customLoader("GuildBank",guildBankAddress)//new this.state.web3.eth.Contract(require("./contracts/BouncerProxy.abi.js"),this.state.address)
            this.setState({guildBankContract})
          }

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
                try{
                  tokenApprovals[tokenAddresses[a]] = await tokenContracts[tokenAddresses[a]].allowance(this.state.applicant,this.state.molochContract._address).call()
                  tokenBalances[tokenAddresses[a]] = await tokenContracts[tokenAddresses[a]].balanceOf(this.state.applicant).call()
                }catch(e){console.log(e)}
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
              let proposal = await this.state.molochContract.proposalQueue(event.index).call()
              let proposalTokenCount = await this.state.molochContract.getProposalTokenLength(event.index).call()
              proposal.tokens = []
              for(let t=0;t<proposalTokenCount;t++){
                proposal.tokens.push(
                  {
                    address: await this.state.molochContract.getProposalTokenAddress(event.index,t).call(),
                    amount: await this.state.molochContract.getProposalTokenAmount(event.index,t).call(),
                  }
                )
              }
              proposals[event.index] = proposal
            }
            this.setState({proposals})
          }
          if(this.state.addMemberEvents){
            let {members} = this.state
            for(let e in this.state.addMemberEvents){
              let member = this.state.addMemberEvents[e]
              let memberInformation = await this.state.molochContract.members(member.member).call()
              memberInformation.someCoinBalance = await this.state.contracts.SomeCoin.balanceOf(member.member).call()
              memberInformation.anotherCoinBalance = await this.state.contracts.AnotherCoin.balanceOf(member.member).call()
              if(this.state.lootTokenContract){
                memberInformation.lootTokenBalance = await this.state.lootTokenContract.balanceOf(member.member).call()
              }
              members[member.member] = memberInformation
            }
            this.setState({members})
          }

          if(this.state.guildBankContract){
            let guildBankTokenAddressCount = await this.state.guildBankContract.getTokenAddressCount().call()
            let guildBankTokens = []
            let guildBankTokenBalances = this.state.guildBankTokenBalances
            let tokenContracts = this.state.tokenContracts
            let tokenContractsChanged = false
            for(let t = 0; t<guildBankTokenAddressCount;t++){

                let thisTokenAddress = await this.state.guildBankContract.tokenAddresses(t).call()
                guildBankTokens.push(thisTokenAddress)
                if(!tokenContracts[thisTokenAddress]){
                  tokenContractsChanged=true
                  tokenContracts[thisTokenAddress] = this.state.customLoader("SomeCoin",thisTokenAddress)
                }
                guildBankTokenBalances[thisTokenAddress] = await tokenContracts[thisTokenAddress].balanceOf(this.state.guildBankContract._address).call()
            }
            this.setState({guildBankTokenAddressCount,guildBankTokens,guildBankTokenBalances})
            if(tokenContractsChanged){
              console.log("tokenContracts CHANGE:",tokenContracts)
              this.setState({tokenContracts})
            }
          }

          this.setState({memberInformation,currentPeriod,currentPeriodInformation,pendingProposals,totalVotingShares})
        }
      }
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
             tributeTokenAddresses:contracts.SomeCoin._address+","+contracts.AnotherCoin._address,
           },async ()=>{
             console.log("Contracts Are Ready:",this.state.contracts)
             this.poll()
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
      if(!contracts){
        contractsDisplay.push(
          <div key="UI" style={{padding:30}}>
            <h1>{"👹 Loading..."}</h1>
          </div>
        )
      }else{

        if(!this.state.molochContract){
          contractsDisplay.push(
            <div key="UI" style={{padding:30}}>
              <h1>{"👹 Deploy Moloch:"}</h1>
              <div>
                foundersAddresses:<input
                  style={{verticalAlign:"middle",width:500,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                  type="text" name="deployfoundersAddresses" value={this.state.deployfoundersAddresses} onChange={this.handleInput.bind(this)}
                /> (csv)
              </div>
              <div>
                foundersVotingShares:<input
                  style={{verticalAlign:"middle",width:200,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                  type="text" name="deployfoundersVotingShares" value={this.state.deployfoundersVotingShares} onChange={this.handleInput.bind(this)}
                /> (csv)
              </div>

              <div>
                periodDuration:<input
                  style={{verticalAlign:"middle",width:100,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                  type="text" name="deployperiodDuration" value={this.state.deployperiodDuration} onChange={this.handleInput.bind(this)}
                /> seconds
              </div>
              <div>
                votingPeriodLength:<input
                  style={{verticalAlign:"middle",width:60,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                  type="text" name="deployvotingPeriodLength" value={this.state.deployvotingPeriodLength} onChange={this.handleInput.bind(this)}
                /> periods
              </div>
              <div>
                gracePeriodLength:<input
                  style={{verticalAlign:"middle",width:60,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                  type="text" name="deploygracePeriodLength" value={this.state.deploygracePeriodLength} onChange={this.handleInput.bind(this)}
                /> periods
              </div>
              <div>
                proposalDeposit:<input
                  style={{verticalAlign:"middle",width:60,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                  type="text" name="deployproposalDeposit" value={this.state.deployproposalDeposit} onChange={this.handleInput.bind(this)}
                /> ETH
              </div>
              <Button size="3" color={"green"} onClick={()=>{
                  let code = require("./contracts/Moloch.bytecode.js")
                  let args = [
                    this.state.deployfoundersAddresses.split(","),
                    this.state.deployfoundersVotingShares.split(","),
                    this.state.deployperiodDuration,
                    this.state.deployvotingPeriodLength,
                    this.state.deploygracePeriodLength,
                    this.state.web3.utils.toWei(this.state.deployproposalDeposit)
                  ]
                  console.log("ARGS",args)
                  tx(contracts.Moloch._contract.deploy({data:code,arguments:args}),5500000,(receipt)=>{
                    console.log("~~~~~~ DEPLOY FROM DAPPARATUS:",receipt)
                    if(receipt.contractAddress){
                      console.log("CONTRACT DEPLOYED:",receipt.contractAddress)
                      window.location = "/"+receipt.contractAddress
                    }
                  })
                }}>
                Deploy
              </Button>
            </div>
          )
        }else{

          //console.log("memberInformation",this.state.memberInformation)
          let approvals = []
          if(this.state.tributeTokenAmounts&&this.state.tributeTokenAddresses){
            let tokenAmounts = this.state.tributeTokenAmounts.split(",")
            let tokenAddresses = this.state.tributeTokenAddresses.split(",")
            for(let a in tokenAddresses)
            {
              approvals.push(
                <div id={a}>
                  <Button size="1" onClick={()=>{
                    tx(this.state.tokenContracts[tokenAddresses[a]].approve(this.state.molochContract._address,tokenAmounts[a]),
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
                  ({this.state.tokenBalances[tokenAddresses[a]]?this.state.tokenBalances[tokenAddresses[a]]:0})
                </div>
              )
            }
          }

          let proposals = []
          for(let p in this.state.proposals){
            let proposal = this.state.proposals[p]
            //console.log("proposal",p,proposal)

            let currentProposalStatus = "(No Quorum)"

            let votesNeeded = this.state.totalVotingShares * this.state.QUORUM_NUMERATOR / this.state.QUORUM_DENOMINATOR
            let totalVotes = proposal.noVotes + proposal.yesVotes

            let result = ""
            for(let e in this.state.processProposalEvents){
              if(p==parseInt(this.state.processProposalEvents[e].index)){
                result=this.state.processProposalEvents[e].result
              }
            }

            let proposalButton = ""
            let voteButtons = ""
            let votingPeriodAt = ""
            let periodDisplay = ""
            let readyToProcessAt = ""

            if(result){
              if(result==1){
                currentProposalStatus = (
                  <span style={{color:"#99ff99"}}>
                    AddedVotingShares
                  </span>
                )
              }else if(result==1){
                currentProposalStatus = (
                  <span style={{color:"#99ff99"}}>
                    AddedNewMember
                  </span>
                )
              }else{
                currentProposalStatus = (
                  <span style={{color:"#ff9999"}}>
                    Failed
                  </span>
                )
              }
            }else if(!proposal.processed){
              let color = "yellow"
              console.log("this.state.currentPeriod",this.state.currentPeriod)
              console.log("proposal.startingPeriod",proposal.startingPeriod)
              console.log("this.state.votingPeriodLength",this.state.votingPeriodLength)
              console.log("this.state.gracePeriodLength",this.state.gracePeriodLength)
              votingPeriodAt = parseInt(proposal.startingPeriod)+parseInt(this.state.votingPeriodLength)
              readyToProcessAt = votingPeriodAt+parseInt(this.state.gracePeriodLength)
              console.log("readyToProcessAt",readyToProcessAt)
              if(this.state.currentPeriod>readyToProcessAt){
                color = "green"
              }
              proposalButton =(
                <Button color={color} onClick={()=>{
                    tx(this.state.molochContract.processProposal(p),2500000,0,0,(receipt)=>{
                      console.log("receipt",receipt)
                    })
                  }}>
                  Process
                </Button>
              )
              let voteColor = "blue"
              if(this.state.currentPeriod>=votingPeriodAt){
                voteColor = "red"
              }else if(this.state.currentPeriod<proposal.startingPeriod){
                voteColor = "orange"
              }
              voteButtons = (
                <span>
                  <Button color={voteColor} onClick={()=>{
                      tx(this.state.molochContract.submitVote(p,1),1500000,0,0,(receipt)=>{
                        console.log("receipt",receipt)
                      })
                    }}>
                    YES
                  </Button>
                  <Button color={voteColor} onClick={()=>{
                      tx(this.state.molochContract.submitVote(p,2),1500000,0,0,(receipt)=>{
                        console.log("receipt",receipt)
                      })
                    }}>
                    NO
                  </Button>
                </span>
              )

              periodDisplay = (
                <span>
                  [{proposal.startingPeriod}/{votingPeriodAt}/{readyToProcessAt}]
                </span>
              )

              if(totalVotes>=votesNeeded){
                if(proposal.yesVotes > proposal.noVotes){
                  currentProposalStatus = "(Passing)"
                }else{
                  currentProposalStatus = "(Failing)"
                }
              }
            }else{
              if(totalVotes>=votesNeeded){
                if(proposal.yesVotes > proposal.noVotes){
                  currentProposalStatus = (
                    <span style={{color:"#77ff77"}}>
                      Passed
                    </span>
                  )
                }else{
                  currentProposalStatus = (
                    <span style={{color:"#ff7777"}}>
                      Failed
                    </span>
                  )
                }
              }
            }



            let proposalTokens = []
            for(let t in proposal.tokens){
              proposalTokens.push(
                <span style={{marginLeft:10}}>
                  <Blockie
                   address={proposal.tokens[t].address}
                   config={{size:3}}
                  />:{proposal.tokens[t].amount}
                </span>
              )
            }

            proposals.push(
              <div key={p}>
                <span style={dividerSpan}>
                  {p}
                </span>
                <span style={dividerSpan}>
                  <Blockie
                   address={proposal.proposer}
                   config={{size:3}}
                  />
                </span>
                :
                (<span style={dividerSpan}>
                   <Blockie
                    address={proposal.applicant}
                    config={{size:3}}
                   />
                </span>
                <span style={dividerSpan}>
                  shares:{proposal.votingSharesRequested}
                </span>)

                [{proposalTokens}]

                <div>
                  <span style={dividerSpan}>
                    {periodDisplay}
                  </span>

                  <span style={dividerSpan}>
                    no:{proposal.noVotes}
                  </span>
                  <span style={dividerSpan}>
                    yes:{proposal.yesVotes}
                  </span>

                  {currentProposalStatus}

                  {voteButtons}
                  {proposalButton}
                </div>
              </div>
            )
          }

          let updatePeriodColor = "orange"
          let periodEndsIn = (this.state.currentPeriodInformation?Math.round(this.state.currentPeriodInformation.endTime-Date.now()/1000):0)
          let periodStartedAt = (this.state.currentPeriodInformation?Math.round(Date.now()/1000-this.state.currentPeriodInformation.startTime):0)

          if(periodEndsIn<=0){
            updatePeriodColor = "green"
          }

          let memberInformation = "loading member information..."
          if(this.state.memberInformation){
            memberInformation = (
              <div style={{color:"#eeeeee"}}>
                {" votingShares:"}{this.state.memberInformation.votingShares}
                {" delegateKey:"}<Blockie
                  address={this.state.memberInformation.delegateKey}
                  config={{size:3}}
                />
              </div>
            )
          }

          let members=[]

          for(let m in this.state.members){
            let member = this.state.members[m]

            let memberControls = ""
            if(m.toLowerCase()==this.state.account.toLowerCase()){
              memberControls = (
                <div>
                  <div>
                  <input
                    style={{verticalAlign:"middle",width:300,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                    type="text" name="delegateKey" value={this.state.delegateKey} onChange={this.handleInput.bind(this)}
                  /><Blockie
                    address={this.state.delegateKey}
                    config={{size:3}}
                  />
                  <Button color={"blue"} onClick={()=>{
                      tx(this.state.molochContract.updateDelegateKey(this.state.delegateKey),2000000,0,0,(receipt)=>{
                        console.log("receipt",receipt)
                        this.setState({delegateKey:""})
                      })
                    }}>
                    updateDelegateKey
                  </Button>{" delegateKey:"}<Blockie
                    address={member.delegateKey}
                    config={{size:3}}
                  />
                  </div>
                  <div>
                  <input
                    style={{verticalAlign:"middle",width:100,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                    type="text" name="collectLootTokens" value={this.state.collectLootTokens} onChange={this.handleInput.bind(this)}
                  />
                  <Button color={"orange"} onClick={()=>{
                      tx(this.state.molochContract.collectLootTokens(this.state.account,this.state.collectLootTokens),2000000,0,0,(receipt)=>{
                        console.log("receipt",receipt)
                        this.setState({collectLootTokens:""})
                      })
                    }}>
                    collectLootTokens
                  </Button>
                  </div>
                  <div>
                    <input
                      style={{verticalAlign:"middle",width:100,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
                      type="text" name="redeemLootTokens" value={this.state.redeemLootTokens} onChange={this.handleInput.bind(this)}
                    />
                    <Button color={"blue"} onClick={()=>{
                        tx(this.state.lootTokenContract.approve(this.state.guildBankContract._address,this.state.redeemLootTokens),2000000,0,0,(receipt)=>{
                          console.log("receipt",receipt)
                        })
                      }}>
                      approve
                    </Button>
                    <Button color={"orange"} onClick={()=>{
                        tx(this.state.guildBankContract.redeemLootTokens(this.state.account,this.state.redeemLootTokens),2000000,0,0,(receipt)=>{
                          console.log("receipt",receipt)
                          this.setState({redeemLootTokens:""})
                        })
                      }}>
                      redeemLootTokens
                    </Button>
                  </div>
                </div>
              )
            }

            members.push(
              <div key={m}>
                <div style={{marginTop:20}}>
                  <Address
                    {...this.state}
                    address={m}
                  />
                </div>
                {memberControls}
                <div style={{borderBottom:"1px solid #555555"}}>
                  <span style={{color:"#eeeeee"}}>{" votingShares:"}{member.votingShares}</span>
                  ({member.someCoinBalance} <Blockie
                   address={contracts.SomeCoin._address}
                   config={{size:3}}
                  />SC)({member.anotherCoinBalance} <Blockie
                   address={contracts.AnotherCoin._address}
                   config={{size:3}}
                  />AC)({member.lootTokenBalance} Loot)
                </div>
              </div>
            )
          }

          let guildBank = ""
          let guildBankEventParser = ""
          if(this.state.guildBankContract){
            guildBankEventParser = (
              <Events
                config={{hide:false}}
                contract={this.state.guildBankContract}
                eventName={"DepositTributeTokens"}
                block={block}
                onUpdate={(eventData,allEvents)=>{
                  console.log("DepositTributeTokens EVENT DATA:",eventData)
                  this.setState({DepositTributeTokenEvents:allEvents})
                }}
              />
            )

          //  guildBankTokenAddressCount
            let guildBankTokens = []
            for(let t in this.state.guildBankTokens){
              let guildBankTokenAddress = this.state.guildBankTokens[t]
              let guildBankTokenBalance = this.state.guildBankTokenBalances[guildBankTokenAddress]
              guildBankTokens.push(
                <div>
                  <Blockie
                    config={{size:3}}
                    address={guildBankTokenAddress}
                  /> {guildBankTokenBalance} (<Blockie
                    config={{size:3}}
                    address={guildBankTokenAddress}
                  /> {Math.floor(guildBankTokenBalance/this.state.totalVotingShares*10)/10} per share)
                </div>
              )
            }

            guildBank = (
              <div>
                <Address
                  {...this.state}
                  address={this.state.guildBankContract._address}
                />
                {guildBankTokens}
              </div>
            )


          }

          contractsDisplay.push(
            <div key="UI" style={{padding:30}}>
              <h1><a href="/">👹</a>{" Moloch's Nasty Sandbox"}
                <span style={{fontSize:16}}> (🛠 {this.state.web3.utils.fromWei(this.state.proposalDeposit)}ETH {this.state.periodDuration}s {this.state.votingPeriodLength} {this.state.gracePeriodLength})</span>
              </h1>
              <div>
                <Address
                  {...this.state}
                  address={this.state.molochContract._address}
                />
              </div>
              <div style={{margin:5}}>
                <span style={{padding:5}}>currentPeriod:{this.state.currentPeriod}</span>
                <span style={{padding:5}}>pendingProposals:{this.state.pendingProposals}</span>
                <span style={{padding:5}}>totalVotingShares:{this.state.totalVotingShares}</span>
              </div>
              <div style={{padding:20,margin:10,marginBottom:30}}>
                <Button color={updatePeriodColor} onClick={()=>{
                    console.log("periodStartedAt",periodStartedAt)
                    console.log("this.state.periodDuration",this.state.periodDuration)
                    let gasNeeded = Math.round(70000 + 50000 * (parseInt(periodStartedAt)/parseInt(this.state.periodDuration)))
                    console.log("gasNeeded",gasNeeded)
                    tx(this.state.molochContract.updatePeriod(),gasNeeded,0,0,(receipt)=>{
                      console.log("receipt",receipt)
                    })
                  }}>
                  updatePeriod()
                </Button>
                <span style={{padding:5}}>period start:{periodStartedAt+"s"}</span>
                <span style={{padding:5}}>period end:{periodEndsIn+"s"}</span>
              </div>

              <div style={{border:"1px solid #666666",margin:10,padding:10}}>
                <h3>🏦 Guild Bank:</h3>
                {guildBank}
              </div>

              <div style={{border:"1px solid #666666",margin:10,padding:10}}>
                <h3>👥 Members:</h3>
                {members}
              </div>
              <div style={{border:"1px solid #666666",margin:10,padding:10}}>
                <h3>📜 Proposals:</h3>
                {proposals}
              </div>

              <div style={{border:"1px solid #666666",margin:10,padding:10}}>
                <h3>💡 Submit Proposal:</h3>
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
                      style={{verticalAlign:"middle",width:600,margin:6,maxHeight:20,padding:5,border:'2px solid #ccc',borderRadius:5}}
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
                    let maxGasLimit = 600000
                    let txData = 0
                    let value = this.state.proposalDeposit
                    tx(this.state.molochContract.submitProposal(
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
                contract={this.state.molochContract}
                eventName={"AddMember"}
                block={block}
                onUpdate={(eventData,allEvents)=>{
                  console.log("EVENT DATA:",eventData)
                  this.setState({addMemberEvents:allEvents})
                }}
              />
              <Events
                config={{hide:false}}
                contract={this.state.molochContract}
                eventName={"SubmitProposal"}
                block={block}
                onUpdate={(eventData,allEvents)=>{
                  console.log("EVENT DATA:",eventData)
                  this.setState({submitProposalEvents:allEvents})
                }}
              />
              <Events
                config={{hide:false}}
                contract={this.state.molochContract}
                eventName={"ProcessProposal"}
                block={block}
                onUpdate={(eventData,allEvents)=>{
                  console.log("EVENT DATA:",eventData)
                  this.setState({processProposalEvents:allEvents})
                }}
              />
              <Events
                config={{hide:false}}
                contract={this.state.molochContract}
                eventName={"SubmitVote"}
                block={block}
                onUpdate={(eventData,allEvents)=>{
                  console.log("EVENT DATA:",eventData)
                  this.setState({submitVoteEvents:allEvents})
                }}
              />
              {guildBankEventParser}
            </div>
          )
        }


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
