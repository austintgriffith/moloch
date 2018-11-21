const clevis = require("./clevis.js")
for(let c in clevis.contracts){
  if(clevis.contracts[c]!="LootToken"){//don't deploy loot token, that is created by Moloch
    clevis.deploy(clevis.contracts[c],0)
  }
}
clevis.transferGuildBankOwnershipToMoloch(0)
