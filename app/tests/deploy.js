const clevis = require("./clevis.js")
for(let c in clevis.contracts){
  clevis.deploy(clevis.contracts[c],0)
}
clevis.transferGuildBankOwnershipToMoloch(0)
