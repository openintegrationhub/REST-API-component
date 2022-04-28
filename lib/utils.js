/* eslint-disable max-len,no-shadow,no-param-reassign,no-underscore-dangle,no-use-before-define,consistent-return,arrow-parens */

const { transform } = require('@openintegrationhub/ferryman');

const axios = require('axios');
const FormData = require('form-data');
const { AttachmentProcessor } = require('@blendededge/ferryman-extensions');
const messages = require('./messages');
const { authTypes } = require('./authTypes');

const {
  getRateLimitDelay,
  rateLimit,
  getRequestTimeout,
  encodeWWWFormParam,
  getMessageSnapshot,
  getAuthFromSecretConfig,
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

/**
 * Valid values for the "Content-Type" header field
 * when sending an attachment to the Attachment Storage Service
 */
 const ALLOWED_CONTENT_TYPES = [
  'application/octet-stream',
  'application/json',
  'application/xml',
  'text/xml',
  'text/plain',
  'text/csv',
  'text/tsv'
];

const getValidMimeType = (contentType) => {
  return ALLOWED_CONTENT_TYPES.includes(contentType) ? contentType : 'application/octet-stream';
}

// eslint-disable-next-line no-unused-vars
const CREDS_HEADER_TYPE = 'CREDS_HEADER_TYPE';

/**
 * @typedef {import("axios").AxiosResponse} AxiosResponse
 */

/**
 * Executes the action's/trigger's logic by sending a request to the assigned URL and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param {Object} msg incoming messages which is empty for triggers
 * @param {Object} cfg object to retrieve triggers configuration values, such as, for example, url and userId
 * @returns {Object} promise resolving a message to be emitted to the platform
 */
/* eslint-disable-next-line func-names */
module.exports.processMethod = async function (msg, cfg, snapshot, TOKEN) {
  const emitter = this;

  emitter.logger.debug('Input message: %o', JSON.stringify(msg));
  emitter.logger.debug('Input configuration: %o', JSON.stringify(cfg));
  emitter.logger.debug('Snapshot data: %o', JSON.stringify(snapshot));

  // Add the snapshot to the message to allow it to be used in transformations
  if (snapshot) {
    msg.data.oihsnapshot = snapshot;
  }

  const { jsonataResponseValidator, httpReboundErrorCodes } = cfg;
  const config = cfg.reader;

  if (!config.url) {
    emitter.logger.error('There is no url', config.url);
    throw new Error('URL is required');
  }
  const requestURL = transform(msg, { customMapping: config.url });
  emitter.logger.debug('This is the transformed url:', requestURL);

  if (!requestURL || requestURL.length === 0) {
    emitter.logger.info('No URL after JSONata transformation');
    emitter.emit('end');
    return;
  }

  const { method, headers, token } = config;
  const body = config.body || {};
  const followRedirect = cfg.followRedirect !== 'doNotFollowRedirects';
  const { auth } = getAuthFromSecretConfig(cfg, emitter.logger);
  const requestTimeout = getRequestTimeout(emitter.logger, cfg);
  // For backwards compatibility supporting cfg.reader.token, but should be under cfg.auth.oauth2.keys.access_token
  const bearerToken = token || (auth && auth.oauth2 && auth.oauth2.keys && auth.oauth2.keys.access_token ? auth.oauth2.keys.access_token : '');

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
    responseType: config.responseType || 'json',
    headers: {},
    // data: {
    //   name: msg.data.name,
    //   first_name: msg.data.first_name,
    //   last_name: msg.data.name,
    //   phone: msg.data.phone,
    //   email: msg.data.email,
    // },
  };
  if (bearerToken && bearerToken.length > 0) {
    headers.Authorization = `Bearer ${bearerToken}`
  }

  const returnObject = {
    received: msg.data,
  };

  emitter.logger.debug('these are the requestOptions:', requestOptions);
  if (auth) {
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
          value: `"Bearer ${bearerToken}"`,
        });
        break;
      default:
    }
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

  // Make request, process response, and perform configured operations on result
  let pageSnapshot;
  try {
    if (formattedMethod !== methodsMap.GET) {
      // For all methods which send a body
      await buildRequestBody();
      emitter.logger.trace('Request data: %o', requestOptions.data);
    }

    if (config.pagingEnabled) {
      // Handle GET and paging of request - if paging enabled
      pageSnapshot = getMessageSnapshot(msg.id, snapshot);
      let lastPage = false;
      while (!lastPage) {
        if (pageSnapshot) {
          emitter.logger.debug(`Paging: pageSnapshot exists. ${JSON.stringify(pageSnapshot)}`);
          msg.data.oihsnapshot = pageSnapshot;
          // Create url for the next page
          const requestURL = transform(msg, { customMapping: config.url });
          requestOptions.url = requestURL;
        }
        // eslint-disable-next-line no-await-in-loop
        await buildRequestBody();
        emitter.logger.trace('Paging: Request data: %o', requestOptions.data);
        emitter.logger.debug('Paging: This is the transformed url:', requestOptions.url);
        // eslint-disable-next-line no-await-in-loop
        const data = await request(requestOptions, config);
        emitter.logger.debug(`Paging: Data for lastPageValidator is ${JSON.stringify(data)}`);
        // Is this the last page? Should evaluate to a boolean
        lastPage = transform(data, { customMapping: config.lastPageValidator });
        // Handle undefined result for last page
        lastPage = lastPage === undefined ? true : lastPage;
        emitter.logger.debug(`Paging: Is this the last page: ${lastPage}`);
        if (config.responseToSnapshotTransform && !lastPage) {
          // Add page snapshot data for the transformation JSONata
          data.oihsnapshot = pageSnapshot;
          const newSnapshot = transform(data, { customMapping: config.responseToSnapshotTransform });
          emitter.logger.debug(`Paging: In case of failure, the new snapshot will be: ${JSON.stringify(newSnapshot)}`);
          // Remove the snapshot from the data so isn't forward in the msg to the next component
          delete data.oihsnapshot;
          pageSnapshot = newSnapshot;
          if (!snapshot) {
            snapshot = {};
          }
          snapshot[msg.id] = newSnapshot;
          emitter.logger.debug('Paging: Emitting snapshot', snapshot);
          emitter.emit('snapshot', snapshot);
        }
      }
      emitter.logger.debug('Paging: Successfully emitted all pages. Clearing snapshot');
      emitter.emit('snapshot', {});
    } else {
      await request(requestOptions, config);
    }
    await emitter.emit('end');
  } catch (e) {
    emitter.logger.debug('Inside catch');
    emitter.logger.trace('Exception during request(s): ', e);

    // TODO: save paging state to snapshot - for resume functionality
    // eslint-disable-next-line no-return-await
    return await buildErrorStructure(e);
  }

  async function request(requestOptions, config) {
    const data = await sendRequest(requestOptions);
    emitter.logger.debug('Axios call success');
    emitter.logger.trace('Process Response: %o', data);
    const attachments = {};
    const processedResponse = await processResponse(data, requestOptions.url, attachments);
    await processedRequestOperations(processedResponse, config, attachments);
    return processedResponse;
  }

  async function sendRequest(requestOptions) {
    emitter.logger.debug('Prior to axios call');
    emitter.logger.trace('Request body: %o', requestOptions.data);
    try {
      return axios(requestOptions);
    } catch (e) {
      emitter.logger.trace('Error in axios call: %o', e);
    }
  }

  /**
   * Emits the message(s) for the next step
   * @param {object} data
   * @param {object} config
   * @param {object} attachments
   */
  async function processedRequestOperations(data, config, attachments = {}) {
    emitter.logger.debug('Process response success');
    emitter.logger.debug(`Request output: ${JSON.stringify(data)}`);

    if (cfg.splitResult && Array.isArray(data)) {
      // Walk through chain of promises: https://stackoverflow.com/questions/30445543/execute-native-js-promise-in-series
      // eslint-disable-next-line no-restricted-syntax
      for (const item of data) {
        const output = messages.newMessage(item, attachments);
        // eslint-disable-next-line no-await-in-loop
        await emitter.emit('data', output);
      }
    } else if (cfg.saveReceivedData) {
      returnObject.response = data;
      const output = messages.newMessage(returnObject, attachments);
      await emitter.emit('data', output);
    } else {
      const output = messages.newMessage(data, attachments);
      await emitter.emit('data', output);
    }
    // Apply transformation to the response and save the data to the snapshot. Can be used for calculating next page.
    if (config.responseToSnapshotTransform) {
      const newSnapshot = transform(data, { customMapping: config.responseToSnapshotTransform });
      emitter.logger.debug('Emitting snapshot', newSnapshot);
      await emitter.emit('snapshot', newSnapshot);
    }
    await rateLimit(emitter.logger, rateLimitDelay);
  }

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

          if (msg.attachments) {
            const attachmentProcessor = new AttachmentProcessor(emitter, TOKEN, cfg.attachmentServiceUrl);
            // Add attachments to form data
            const attachments = Object.keys(msg.attachments).map(
              async (key) => {
                emitter.logger.debug('Attachment key: ', key);
                const attachment = await attachmentProcessor.getAttachment(msg.attachments[key].url, config.responseType || 'stream');
                emitter.logger.debug('Have attachment....');
                // Append attachment to form data
                await formData.append(key,
                  attachment.data, {
                    filename: key,
                    contentType: msg.attachments[key]['content-type'],
                  });
                emitter.logger.debug('Appended attachment...');
                return {
                  key,
                  value: msg.attachments[key].url,
                  filename: key,
                  'Content-Type': msg.attachments[key]['content-type'],
                };
              },
            );
            emitter.logger.debug('Attachments found on the message: ', JSON.stringify(attachments));
          }

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

  /**
   * Converts Axios response object to parsed content
   * @param {AxiosResponse} response
   * @param {string} requestUrl
   * @param {object} attachments
   * @returns parsed content
   * parse response structure
   *
   * 1) If body is not exists return empty object {}
   * 2) If Content-type is exists in response try to parse by content type
   * 3) If Content-type is not exists try to parse as JSON. If we get parsing error
   * we should return response as is.
   */
  async function processResponse(response, requestUrl, attachments) {
    emitter.logger.info('HTTP Response headers: %j', response.headers);

    if (response.data && response.data.byteLength === 0) {
      emitter.logger.debug('Response size was 0. Returning empty object');
      return Promise.resolve({});
    }

    const contType = response.headers['content-type'];

    emitter.logger.debug('Response content type: %o', contType);
    if (!contType || (contType && contType.includes('json') && !contType.includes('jsonl'))) {
      const data = await Promise.resolve(response.data);
      emitter.logger.info('HTTP Response body1: %o', data);
      if (jsonataResponseValidator) {
        const valid = transform(data, { customMapping: jsonataResponseValidator });
        emitter.logger.debug(`jsonataResponseValidator config is ${jsonataResponseValidator} and evaluates to ${valid}`);
        if (!valid) {
          // Throw error to, if enabled, force a rebound of this component
          const err = new Error('JSONata validation against response failed and request should be retried in rebound queue');
          err.response = { status: 429 };
          return Promise.reject(err);
        }
      }
      return data;
    }
    // TODO: implement later and add unit tests for XML file
    // if (contType.includes('xml')) {
    //   emitter.logger.info('Trying to parse response as XML');
    //   const parseOptions = {
    //     trim: false,
    //     normalize: false,
    //     explicitArray: false,
    //     normalizeTags: false,
    //     attrkey: '_attr',
    //     tagNameProcessors: [
    //       (name) => name.replace(':', '-'),
    //     ],
    //   };
    //   return xml2js(response.body, parseOptions)
    //     .then((result) => {
    //       emitter.logger.info('Response successfully parsed');
    //       return result;
    //     });
    // }
    if (contType.includes('image') || contType.includes('msword')
          || contType.includes('msexcel') || contType.includes('pdf')
          || contType.includes('csv') || contType.includes('octet-stream')
          || contType.includes('binary') || contType.includes('jsonl')) {
      const attachmentProcessor = new AttachmentProcessor(emitter, TOKEN, cfg.attachmentServiceUrl);
      const mimeType = getValidMimeType(contType);
      const uploadResponse = await attachmentProcessor.uploadAttachment(response.data, mimeType);
      emitter.logger.info('Binary data successfully saved to attachments');
      // where is the file saved?
      const attachmentUrl = uploadResponse.config.url;
      // what is the name of the file downloaded? (or the site it was downloaded from)
      const urlObject = new URL(requestUrl);
      const fileName = urlObject.pathname.split('/').pop() || urlObject.pathname || requestUrl;
      attachments[fileName] = {
        url: attachmentUrl,
      };
      return uploadResponse.data;
    }
    emitter.logger.info('Unknown content-type. Trying to parse as JSON');
    return Promise.resolve(response.data);
  }

  async function buildErrorStructure(e) {
    const reboundErrorCodes = httpReboundErrorCodes ? new Set(httpReboundErrorCodes) : HTTP_ERROR_CODE_REBOUND;
    emitter.logger.debug(`Configured http error status codes for rebound are ${Array.from(reboundErrorCodes.values())}`);
    if (
      e.response
      && cfg.enableRebound
      && (reboundErrorCodes.has(e.response.status)
        || e.message.includes('DNS lookup timeout'))
    ) {
      emitter.logger.info('Component error: %o', e);
      emitter.logger.info('Starting rebound');
      await emitter.emit('rebound', e.message);
    } else if (e.response && cfg.dontThrowErrorFlg) {
      const output = {
        errorCode: e.response.status,
        errorMessage: e.message,
        errorStack: e.stack,
      };

      const returnOutput = await cfg.saveReceivedData ? { ...output, received: returnObject.received } : output;

      emitter.logger.debug('Component output: %o', returnOutput);
      await emitter.emit('data', messages.newMessage(returnOutput));
      await rateLimit(emitter.logger, rateLimitDelay);
    } else {
      emitter.logger.error('Component error: %o', e);
      if (e.message.indexOf(`timeout of ${requestTimeout}ms exceeded`) >= 0) {
        e.message = `Timeout error! Waiting for response more than ${requestTimeout} ms`;
      }
      await emitter.emit('error', e);
      await rateLimit(emitter.logger, rateLimitDelay);
    }
    await emitter.emit('end');
  }
};
