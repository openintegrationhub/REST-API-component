const axios = require('axios');
const uuid = require('uuid');

const REQUEST_TIMEOUT = process.env.REQUEST_TIMEOUT ? parseInt(process.env.REQUEST_TIMEOUT, 10) : 10000; // 10s
const REQUEST_MAX_RETRY = process.env.REQUEST_MAX_RETRY ? parseInt(process.env.REQUEST_MAX_RETRY, 10) : 7; // 10s
const REQUEST_RETRY_DELAY = process.env.REQUEST_RETRY_DELAY ? parseInt(process.env.REQUEST_RETRY_DELAY, 10) : 7000; // 7s
const REQUEST_MAX_CONTENT_LENGTH = process.env.REQUEST_MAX_CONTENT_LENGTH ? parseInt(process.env.REQUEST_MAX_CONTENT_LENGTH, 10) : 10485760; // 10MB
const { ATTACHMENT_STORAGE_SERVICE_BASE_URL } = process.env;

// Adapted from https://github.com/elasticio/component-commons-library/blob/master/lib/attachment/AttachmentProcessor.ts
class AttachmentProcessor {
  constructor(emitter, token, attachmentStorageServiceBaseUrl) {
    this.attachmentService = attachmentStorageServiceBaseUrl;
    this.emitter = emitter;
    this.token = token;
  }

  async getAttachment(url, responseType) {
    const ax = axios.create();
    AttachmentProcessor.addRetryCountInterceptorToAxios(ax);

    console.log(`Getting attachment ${responseType} from ${url}`);
    const axConfig = {
      url,
      responseType,
      method: 'get',
      timeout: REQUEST_TIMEOUT,
      retry: REQUEST_MAX_RETRY,
      delay: REQUEST_RETRY_DELAY,
      withCredentials: true,
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    };

    return ax(axConfig);
  }

  async uploadAttachment(body, mimeType) {
    const putUrl = await AttachmentProcessor.preparePutUrl(this.attachmentService);
    const ax = axios.create();
    AttachmentProcessor.addRetryCountInterceptorToAxios(ax);

    const axConfig = {
      url: putUrl,
      data: body,
      method: 'put',
      timeout: REQUEST_TIMEOUT,
      retry: REQUEST_MAX_RETRY,
      delay: REQUEST_RETRY_DELAY,
      maxContentLength: REQUEST_MAX_CONTENT_LENGTH,
      withCredentials: true,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': mimeType,
      },
    };

    return ax(axConfig);
  }

  static async preparePutUrl(attachmentService) {
    const service = attachmentService || ATTACHMENT_STORAGE_SERVICE_BASE_URL;
    const signedUrl = `${service}/objects/${uuid.v4()}`;

    this.emitter.logger.debug(`Attachment Storage Service signed url is ${signedUrl}`);
    return signedUrl;
  }

  static addRetryCountInterceptorToAxios(ax) {
    ax.interceptors.response.use(undefined, (err) => { //  Retry count interceptor for axios
      const { config } = err;
      if (!config || !config.retry || !config.delay) {
        return Promise.reject(err);
      }
      config.currentRetryCount = config.currentRetryCount || 0;
      if (config.currentRetryCount >= config.retry) {
        return Promise.reject(err);
      }
      config.currentRetryCount += 1;
      return new Promise(resolve => setTimeout(() => resolve(ax(config)), config.delay));
    });
  }
}
exports.AttachmentProcessor = AttachmentProcessor;
