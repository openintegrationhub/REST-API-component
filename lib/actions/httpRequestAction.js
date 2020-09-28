const { processMethod } = require("../utils.js");

function processAction(msg, cfg) {
  console.log("msg:  ", msg);
  console.log("cfg:  ", cfg);

  return processMethod.call(this, msg, cfg);
}

exports.process = processAction;
