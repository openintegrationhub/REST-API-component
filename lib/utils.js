/* eslint-disable max-len,no-shadow,no-param-reassign,no-underscore-dangle,no-use-before-define,consistent-return,arrow-parens */

const { transform } = require('@openintegrationhub/ferryman');

const axios = require('axios');
const FormData = require('form-data');
const messages = require('./messages');


const {
  getRateLimitDelay,
  rateLimit,
  getRequestTimeout,
  encodeWWWFormParam,
} = require('./helpers');

const HTTP_ERROR_CODE_REBOUND = new Set([408, 423, 429, 500, 502, 503, 504]);

const methodsMap = {
  DELETE: 'delete',
  GET: 'get',
  PATCH: 'patch',
  POST: 'post',
  PUT: 'put',
};

const bodyEncodings = {
  FORM_DATA: 'form-data',
  RAW: 'raw',
  URLENCODED: 'urlencoded',
};

const contentTypes = {
  FORM_DATA: 'multipart/form-data',
  URLENCODED: 'application/x-www-form-urlencoded',
  TEXT: 'text/plain',
  APP_JSON: 'application/json',
  APP_XML: 'application/xml',
  TEXT_XML: 'text/xml',
  HTML: 'text/html',
};

const authTypes = {
  NO_AUTH: 'No Auth',
  BASIC: 'Basic Auth',
  API_KEY: 'API Key Auth',
  OAUTH2: 'OAuth2',
};

// eslint-disable-next-line no-unused-vars
const CREDS_HEADER_TYPE = 'CREDS_HEADER_TYPE';

/**
 * Executes the action's/trigger's logic by sending a request to the assigned URL and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param {Object} msg incoming messages which is empty for triggers
 * @param {Object} cfg object to retrieve triggers configuration values, such as, for example, url and userId
 * @returns {Object} promise resolving a message to be emitted to the platform
 */
/* eslint-disable-next-line func-names */
module.exports.processMethod = async function (msg, cfg, snapshot) {
  const emitter = this;

  emitter.logger.debug('Input message: %o', JSON.stringify(msg));
  emitter.logger.debug('Input configuration: %o', JSON.stringify(cfg));
  emitter.logger.debug('Snapshot data: %o', JSON.stringify(snapshot));

  // Add the snapshot to the message to allow it to be used in transformations
  if (snapshot) {
    msg.data.oihsnapshot = snapshot;
  }

  const config = cfg.reader;

  if (!config.url) {
    emitter.logger.error('there is no url', config.url);
    throw new Error('URL is required');
  }
  const requestURL = transform(msg, { customMapping: config.url });
  emitter.logger.debug('this is the transformed url:', requestURL);

  const { method, headers, token } = config;
  const body = config.body || {};
  const followRedirect = cfg.followRedirect !== 'doNotFollowRedirects';
  const { auth } = cfg;
  const requestTimeout = getRequestTimeout(emitter.logger, cfg);
  // const token = cfg.token;

  if (!method) {
    throw new Error('Method is required');
  }

  const formattedMethod = methodsMap[method];

  if (!formattedMethod) {
    throw new Error(
      `Method "${method}" isn't one of the: ${Object.keys(methodsMap)}.`,
    );
  }

  // // init snapshot first time
  // if (pagingSupport && !snapshot.timestamp) {
  //   var epoch = new Date(Date.parse('1970-01-01T00:00:00'));
  //   snapshot = {
  //     timestamp : epoch.toISOString(),
  //   };
  // }

  const rateLimitDelay = getRateLimitDelay(emitter.logger, cfg);

  /*
   if cfg.followRedirect has value doNotFollowRedirects
   or cfg.followRedirect is not exists
   followRedirect option should be true
   */
  const requestOptions = {
    method: formattedMethod,
    url: requestURL,
    maxRedirects: followRedirect ? 5 : 0,
    gzip: true,
    resolveWithFullResponse: true,
    simple: false,
    encoding: null,
    strictSSL: !cfg.noStrictSSL,
    timeout: requestTimeout,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      name: msg.data.name,
      first_name: msg.data.first_name,
      last_name: msg.data.name,
      phone: msg.data.phone,
      email: msg.data.email,
    },
  };

  emitter.logger.debug('these are the requestOptions:', requestOptions);

  switch (auth.type) {
    case authTypes.BASIC:
      headers.push({
        key: 'Authorization',
        // eslint-disable-next-line no-buffer-constructor
        value: `"Basic ${Buffer.from(
          `${auth.basic.username}:${auth.basic.password}`,
          'utf8',
        ).toString('base64')}"`,
      });

      break;

    case authTypes.API_KEY:
      headers.push({
        key: auth.apiKey.headerName,
        value: `"${auth.apiKey.headerValue}"`,
      });

      break;
    case authTypes.OAUTH2:
      emitter.logger.trace('auth = %j', auth);
      // eslint-disable-next-line no-case-declarations

      headers.push({
        key: 'Authorization',
        value: `"Bearer ${token}"`,
      });
      break;
    default:
  }

  if (headers && headers.length) {
    requestOptions.headers = headers.reduce((headers, header) => {
      if (!header.key || !header.value) {
        return headers;
      }
      headers[header.key.toLowerCase()] = transform(
        msg,
        { customMapping: header.value },
        {},
      );
      return headers;
    }, requestOptions.headers || {});
  }

  emitter.logger.debug('Request options: %o', JSON.stringify(requestOptions));

  return buildRequestBody()
    .then(() => {
      emitter.logger.trace('Request body: %o', requestOptions.data);
      return axios(requestOptions);
    })
    .then(async (result) => {
      const { data } = result;
      emitter.logger.debug(`Request output: ${JSON.stringify(data)}`);

      if (cfg.splitResult && Array.isArray(data)) {
        // Walk through chain of promises: https://stackoverflow.com/questions/30445543/execute-native-js-promise-in-series
        // eslint-disable-next-line no-restricted-syntax
        for (const item of data) {
          const output = messages.newMessage(item);
          // eslint-disable-next-line no-await-in-loop
          await emitter.emit('data', output);
        }
      } else {
        const output = messages.newMessage(data);
        await emitter.emit('data', output);
      }
      // Apply transformation to the response and save the data to the snapshot. Can be used for calculating next page.
      if (config.responseToSnapshotTransform) {
        const newSnapshot = transform(data, { customMapping: config.responseToSnapshotTransform });
        emitter.logger.debug('Emitting snapshot', newSnapshot);
        await emitter.emit('snapshot', newSnapshot);
      }
      // if(pagingSupport) {
      //   const pageNumber = transform(msg, {customMapping: cfg.pageNumberTransform});
      //   pageNumber = typeof pageNumber === "string" ? Number(pageNumber) : pageNumber;
      //   emitter.logger.debug(`Current pageNumber = ${pageNumber}`);
      //   const now = new Date(Date.now());
      //   const newSnapshot = {
      //     timestamp : now.toISOString(),
      //     nextPage: pageNumber + 1
      //   };
      //   emitter.logger.debug("Emitting snapshot", newSnapshot);
      //   await self.emit('snapshot', newSnapshot);
      // }
      await rateLimit(emitter.logger, rateLimitDelay);
      await emitter.emit('end');
    })
    .catch(await buildErrorStructure);

  // eslint-disable-next-line no-unused-vars
  function checkOAuth2Keys(keys) {
    emitter.logger.trace('Check keys = %j', keys);
    if (!keys) {
      throw new Error('cfg.auth.oauth2.keys can not be empty');
    }
    if (!keys.access_token) {
      throw new Error('No access tokens were returned by the OAuth2 provider');
    }
    if (!keys.refresh_token) {
      throw new Error(
        'No refresh tokens were returned by the OAuth2 provider. Try to add access_type:offline as an additional parameter',
      );
    }
  }

  // eslint-disable-next-line no-unused-vars
  async function fetchNewToken() {
    emitter.logger.debug('Fetching new oauth2 token...');
    const { oauth2 } = auth;
    const authTokenResponse = await axios({
      url: oauth2.tokenUri,
      method: 'POST',
      json: true,
      simple: false,
      resolveWithFullResponse: true,
      form: {
        refresh_token: oauth2.keys.refresh_token,
        grant_type: 'refresh_token',
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        scope: oauth2.scopes ? oauth2.scopes.join(' ') : '',
      },
    });

    emitter.logger.trace('New token fetched : %j', authTokenResponse);

    if (authTokenResponse.status >= 400) {
      throw new Error(
        `Error in authentication.  Status code: ${
          authTokenResponse.status
        }, Body: ${JSON.stringify(authTokenResponse.data)}`,
      );
    }

    return authTokenResponse.data;
  }

  function buildRequestBody() {
    if (formattedMethod !== methodsMap.GET) {
      const bodyEncoding = {
        [contentTypes.FORM_DATA]: bodyEncodings.FORM_DATA,
        [contentTypes.URLENCODED]: bodyEncodings.URLENCODED,
      }[body.contentType] || bodyEncodings.RAW;

      // eslint-disable-next-line default-case
      switch (bodyEncoding) {
        case bodyEncodings.FORM_DATA:
          emitter.logger.trace('formData: %o', body.formData);
          return Promise.resolve().then(async () => {
            const formData = new FormData();
            await Promise.all(body.formData.map(async (item) => {
              await processItem(item, formData);
            }));
            requestOptions.data = formData;
            const formHeaders = Object.entries(formData.getHeaders());
            // emitter.logger.debug('Form data headers are: ', Object.entries(formHeaders));
            emitter.logger.debug('FormData headers:', formHeaders);
            requestOptions.headers = formHeaders.reduce((headers, header) => {
              const [key, value] = header;
              if (!key || !value) {
                return headers;
              }
              if (headers[key]) {
                headers[key] = value;
              } else {
                headers[key.toLowerCase()] = value;
              }
              return headers;
            }, requestOptions.headers);
            return requestOptions.data;
          });

        case bodyEncodings.RAW:
          if (!body.raw) {
            break;
          }

          requestOptions.data = transform(
            msg,
            { customMapping: body.raw },
          );
          if (typeof requestOptions.data === 'object') {
            requestOptions.data = JSON.stringify(requestOptions.data);
          }
          break;

        case bodyEncodings.URLENCODED:
          if (!body.urlencoded.length) {
            break;
          }

          // eslint-disable-next-line no-case-declarations
          const evaluatedUrlencoded = body.urlencoded
            .map((pair) => ({
              key: pair.key,
              value: transform(msg, { customMapping: pair.value }),
            }))
            .reduce((str, pair, index) => {
              const equation = `${encodeWWWFormParam(
                pair.key,
              )}=${encodeWWWFormParam(pair.value)}`;

              return index === 0 ? equation : `${str}&${equation}`;
            }, null);

          requestOptions.data = evaluatedUrlencoded;
          break;
      }
      emitter.logger.trace('Request data: %o', requestOptions.data);
    }

    async function processItem(item, formData) {
      emitter.logger.trace(`processItem: ${JSON.stringify(item)}, formData: ${JSON.stringify(formData)}`);
      if (item.filename) {
        try {
          const result = await axios(item.value);
          formData.append(item.key, result.data, { filename: item.filename, contentType: item['Content-Type'] });
          return formData;
        } catch (result) {
          emitter.logger.error(result);
        }
      }
      formData.append(item.key, transform(msg, { customMapping: item.value }));
      return formData;
    }

    return Promise.resolve(requestOptions.data);
  }

  async function buildErrorStructure(e) {
    if (
      e.response
      && cfg.enableRebound
      && (HTTP_ERROR_CODE_REBOUND.has(e.response.status)
        || e.message.includes('DNS lookup timeout'))
    ) {
      emitter.logger.info('Component error: %o', e);
      emitter.logger.info('Starting rebound');
      emitter.emit('rebound', e.message);
      emitter.emit('end');
    } else if (e.response && cfg.dontThrowErrorFlg) {
      const output = {
        errorCode: e.response.status,
        errorMessage: e.message,
        errorStack: e.stack,
      };
      emitter.logger.debug('Component output: %o', output);
      await emitter.emit('data', messages.newMessage(output));
      await rateLimit(emitter.logger, rateLimitDelay);
      await emitter.emit('end');
    } else {
      emitter.logger.error('Component error: %o', e);
      if (e.message.indexOf(`timeout of ${requestTimeout}ms exceeded`) >= 0) {
        e.message = `Timeout error! Waiting for response more than ${requestTimeout} ms`;
      }
      await emitter.emit('error', e);
      await rateLimit(emitter.logger, rateLimitDelay);
      await emitter.emit('end');
    }
  }
};
