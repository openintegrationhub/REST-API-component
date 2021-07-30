# REST-API-component

This is the Rest api component adjusted to the new ferryman library

The **REST API component** is a simple yet powerful component that allows you to connect to any REST API without programming your own components and deploying them into the platform.

The REST API component will perform a single REST API call when executed. Incoming data can gets used to configure the API call made and the response from the API call will be the output.

This document covers the following topics:

- [Introduction](#introduction)
- [Authorization methods](#authorisation-methods)
- [Defining HTTP headers](#defining-http-headers)
- [HTTP Headers in Response](#http-headers)

## Introduction

_Numbers show: (1) The URL and method of the REST API resource, (2) the HTTP call headers. (3) configuration options and (4) follow redirect mode._

1.  HTTP methods and URL

- REST API component supports the following HTTP methods: `GET`, `PUT`, `POST`, `DELETE` and `PATCH`.
- The URL of the REST API resources. Accepts JSONata expressions, meaning the URL address evaluates [JSONata](http://jsonata.org/) expressions.

2. Request Headers and Body

- Definition of request [headers](#defining-http-headers)
- Definition of request [body](#defining-http-body), if the HTTP method is not `GET`

3. Configuration options

- `` Don`t throw Error on Failed Calls `` - if enabled return error, error code and stacktrace in message body otherwise throw error in flow.
- `Split Result if it is an Array` - if enabled and response is array, creates message for each item of array. Otherwise create one message with response array.
- `Retry on failure` - enabling [rebound] feature for following HTTP status codes:
  - 408: Request Timeout
  - 423: Locked
  - 429: Too Many Requests
  - 500: Internal Server Error
  - 502: Bad Gateway
  - 503: Service Unavailable
  - 504: Gateway Timeout
  - DNS lookup timeout

- `Do not verify SSL certificate (unsafe)` - disable verifying the server certificate - **unsafe**.
- `Follow redirect mode` - If you want disable Follow Redirect functionality, you can use option `Follow redirect mode`.By default `Follow redirect mode` option has value `Follow redirects`.
- `Delay` - If you want to slow down requests to your API you can set delay value (in seconds) and the component will delay calling the next request after the previous request.
   Time for the delay is calculated as `Delay`/ `Call Count` and shouldn't be more than 1140 seconds (19 minutes due to platform limitation).
   The `Call Count` value by default is 1. If you want to use another value, please set the `Call Count` field.
   Notice: See [Known Limitations](#known-limitations) about `Delay` value.
- `Call Count` - the field should be used only in pair with `Delay`, default to 1.
- `Request timeout` - Timeout period in milliseconds (1-1140000) while component waiting for server response, also can be configured with REQUEST_TIMEOUT environment variable if configuration field is not provided. Defaults to 100000 (100 sec).

   Notice: Specified for component REQUEST_TIMEOUT enviroment variable would be overwritten by specified value of Request timeout, default value would be also overwritten
- `responseToSnapshotTransform` - This is a JSONata applied to the REST response body and stored in the snapshot as an object.

- `Snapshot in URL tranform` - If a snapshot value is available it is added into the msg.data object as `msg.data.oihsnapshot`. This can be used in conjuction with the `responseToSnapshotTransform` to perform paging. You can save information for the next page from the response in the snapshot and then use the snapshot information in the next request URL.

- `Save Received Data` - If enabled, returned message will include the data received by the REST component and the resulting data.

## Authorisation methods

To use the REST API component with any restricted access API provide the authorisation information.

"REST API component Basic authorisation"
_Example above shows how to add the username/password to access the API during the integration flow design._

You can add the authorisation methods during the integration flow design or by going to your `Settings > Security credentials > REST client` and adding there.

REST API component supports 4 authorisation types:

- `No Auth` - use this method to work with any open REST API
- `Basic Auth` - use it to provide login credentials like **username/password**
- `API Key Auth` - use it to provide `API Key` to access the resource
- `OAuth2` - use it to provide `Oauth2` credentials to access the resource. Currently it is implemented `Authorization code` OAuth2 flow.

Please note that the result of creating a credential is an HTTP header automatically placed for you. You can also specify the authorisation in the headers section directly.

### Sending JSON data

Here is how to send a JSON data in the body. Change the **content type** to `application/json` and the **body input part** would change accordingly to accept JSON object. Please note that this field supports [JSONata](http://jsonata.org) expressions.

"REST API component Body sending JSON data"
_Example shows the JSON in the body where the `name` parameter value gets mapped using the value of `project_name` from the previous step of integration._

## HTTP Headers

You can to get HTTP response header only if `` Don`t throw Error on Failed Calls `` option is checked.
In this case output structure of component will be:

```js
    {
      headers:<HTTP headers>,
      body:<HTTP response body>,
      statusCode:<HTTP response status code>
      statusMessage:<HTTP response status message>
    }
```
