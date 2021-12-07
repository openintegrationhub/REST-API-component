const { processMethod } = require('../utils.js');

function processAction(msg, cfg, snapshot) {
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  this.logger.debug('snapshot: ', snapshot);

  return processMethod.call(this, msg, cfg, snapshot);
}

exports.process = processAction;
