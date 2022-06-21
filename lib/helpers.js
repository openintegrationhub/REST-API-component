const { transform } = require('@openintegrationhub/ferryman');
const { authTypes } = require('./authTypes');

const MAX_DELAY_BETWEEN_CALLS = 1140 * 1000; // 1140 = 19 minutes in seconds

const REQUEST_TIMEOUT = process.env.REQUEST_TIMEOUT
  ? parseInt(process.env.REQUEST_TIMEOUT, 10)
  : 100000; // 100s

function sleep(delay) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function getDelay(delay) {
  const delayInt = parseInt(delay, 10);
  if (!delayInt || delayInt < 1) {
    // TODO: Edit Error message if config fields names will be changed
    throw new Error(
      'Configuration error: Delay value should be a positive integer',
    );
  }
  return delayInt;
}

function getCallCount(callCount) {
  const callCountInt = parseInt(callCount, 10);
  if (!callCountInt || callCountInt < 1) {
    // TODO: Edit Error message if config fields names will be changed
    throw new Error(
      'Configuration error: Call Count value should be a positive integer',
    );
  }
  return callCountInt;
}

function getDelayBetweenCalls(delay, callCount) {
  const delayBetweenCalls = (delay * 1000) / callCount;
  if (delayBetweenCalls < 0) {
    // TODO: Edit Error message if config fields names will be changed
    throw new Error(
      'Configuration error: Delay Between Calls should be positive value',
    );
  }
  if (delayBetweenCalls > MAX_DELAY_BETWEEN_CALLS) {
    // TODO: Edit Error message if config fields names will be changed
    throw new Error(
      `Configuration error: Delay Between Calls should be less than ${MAX_DELAY_BETWEEN_CALLS} milliseconds`,
    );
  }
  return delayBetweenCalls;
}

function getRateLimitDelay(logger, cfg) {
  logger.info('Checking rate limit parameters...');
  const { delay, callCount } = cfg;
  if (callCount && !delay) {
    // TODO: Edit Error message if config fields names will be changed
    throw new Error(
      'Call Count value should be used only in pair with Delay option',
    );
  }
  let rateLimitDelay = null;
  if (delay) {
    const delayInt = getDelay(delay);
    logger.debug('Delay is set to:', delay);
    if (callCount) {
      const callCountInt = getCallCount(callCount);
      logger.debug('Call Count is set to:', callCountInt);
      rateLimitDelay = getDelayBetweenCalls(delayInt, callCountInt);
    } else {
      rateLimitDelay = delay * 1000;
    }
    logger.debug('rateLimitDelay is:', rateLimitDelay);
  }
  return rateLimitDelay;
}

async function rateLimit(logger, delay) {
  if (delay) {
    logger.info(`Delay Between Calls is set to: ${delay} ms`);
    logger.debug('Delay is start', new Date());
    await sleep(delay);
    logger.debug('Delay is done', new Date());
  } else {
    logger.info(
      'Delay Between Calls is not set, process message without delay...',
    );
  }
}

function getRequestTimeout(logger, cfg) {
  const requestTimeout = cfg.requestTimeoutPeriod
    ? parseInt(cfg.requestTimeoutPeriod, 10)
    : REQUEST_TIMEOUT;

  if (!(requestTimeout > 0) || requestTimeout > 1140000) {
    logger.error(`Incorrect Request Timeout input found - '${requestTimeout}'`);
    throw new Error(
      `Incorrect Request Timeout input found - '${requestTimeout}'`,
    );
  }

  return requestTimeout;
}

/**
 * Method to encode x-www-form-urlencoded parameter.
 * Additional replacing requires cause `encodeURIComponent` methods not working for !'()* symbols
 * Also ' ' should be encoded as '+' which requires an additional replacing for '%20'
 *
 * @param {string} param input form key or value parameter
 */
function encodeWWWFormParam(param) {
  return encodeURIComponent(param)
    .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)
    .replace(/%20/g, '+');
}

function getMessageSnapshot(id, sourceSnapshot) {
  const snapshot = { ...sourceSnapshot } || {};
  // Initialize to first page and 1/1/1970
  const firstPage = {
    nextPage: 0,
    timestamp: Date.UTC(0),
  };
  if (snapshot && snapshot[id]) {
    return snapshot[id];
  }
  // Return the first page for this message
  return firstPage;
}

function getAuthFromSecretConfig(cfg, logger) {
  const {
    username, passphrase, key, headerName, accessToken, secretAuthTransform,
  } = cfg;
  const returnConfig = { ...cfg };
  const { auth = {} } = returnConfig;

  // Use JSONata to populate cfg.auth object, works for all types but especially helpful for the MIXED type
  if (secretAuthTransform) {
    returnConfig.auth = transform(cfg, { customMapping: secretAuthTransform });
    logger.debug(`helpers.getAuthFromSecretConfig: after transforming auth config: ${JSON.stringify(returnConfig)}`);
    return returnConfig;
  }
  // Found username and password, authenticate with basic authentication
  if (username && passphrase) {
    auth.basic = auth.basic ? auth.basic : {};
    auth.type = authTypes.BASIC;
    auth.basic.username = username;
    auth.basic.password = passphrase;
  }
  // Found API_KEY type
  if (key && headerName) {
    auth.type = authTypes.API_KEY;
    auth.apiKey = auth.apiKey ? auth.apiKey : {};
    auth.apiKey.headerName = headerName;
    auth.apiKey.headerValue = key;
  }
  // Found an accessToken from OA1_TWO_LEGGED, OA1_THREE_LEGGED, OA2_AUTHORIZATION_CODE, or SESSION_AUTH types
  if (accessToken) {
    auth.type = authTypes.OAUTH2;
    auth.oauth2 = auth.oauth2 ? auth.oauth2 : {};
    auth.oauth2.keys = auth.oauth2.keys ? auth.oauth2.keys : {};
    auth.oauth2.keys.access_token = accessToken;
  }
  returnConfig.auth = auth;
  logger.debug(`helpers.getAuthFromSecretConfig: config object is now: ${JSON.stringify(returnConfig)}`);
  return returnConfig;
}

function removeSnapshotFromRequest(request) {
  // deep clone
  const cleanRequest = JSON.parse(JSON.stringify(request));
  delete cleanRequest.oihsnapshot;
  return cleanRequest;
}

exports.sleep = sleep;
exports.rateLimit = rateLimit;
exports.getRateLimitDelay = getRateLimitDelay;
exports.getRequestTimeout = getRequestTimeout;
exports.encodeWWWFormParam = encodeWWWFormParam;
exports.getMessageSnapshot = getMessageSnapshot;
exports.removeSnapshotFromRequest = removeSnapshotFromRequest;
exports.getAuthFromSecretConfig = getAuthFromSecretConfig;
