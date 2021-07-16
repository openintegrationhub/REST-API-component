const { processMethod } = require('../utils.js');

function processAction(msg, cfg) {
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);

  return processMethod.call(this, msg, cfg);
}

exports.process = processAction;
