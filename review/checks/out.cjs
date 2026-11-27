// Where the checks put their stills: review/checks/out, or the folder named in OUT. The folder is not committed.
const fs = require('fs'), path = require('path')
const dir = process.env.OUT || path.join(__dirname, 'out')
fs.mkdirSync(dir, { recursive: true })
module.exports = dir
