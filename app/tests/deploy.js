const clevis = require("./clevis.js")
for(let c in clevis.contracts){
  //don't deploy loottoken or guildcoin, that is created by Moloch
  if(clevis.contracts[c]!="LootToken"||clevis.contracts[c]!="GuildBank"){
    clevis.deploy(clevis.contracts[c],0)
  }
}
//clevis.transferGuildBankOwnershipToMoloch(0)
