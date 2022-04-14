const { processMethod } = require('../utils.js');
const { wrapper } = require('@blendededge/ferryman-extensions');

function processAction(msg, cfg, snapshot) {
  const wrapped = wrapper(this, msg, cfg, snapshot);
  this.logger.debug('msg:  ', msg);
  this.logger.debug('cfg:  ', cfg);
  this.logger.debug('snapshot: ', snapshot);

  return processMethod.call(wrapped, msg, cfg, snapshot);
}

exports.process = processAction;
