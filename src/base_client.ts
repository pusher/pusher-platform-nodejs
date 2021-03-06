import { IncomingMessage } from 'http';
import * as https from 'https';
import * as HttpRequest from 'request';
import { format as formatURL } from 'url';
import {
  RequestOptions, ErrorResponse, IncomingMessageWithBody
} from './common';
import SDKInfo from './sdk_info';

export interface BaseClientOptions {
  host: string;
  port: number;
  serviceName: string;
  serviceVersion: string;
  instanceId: string;
  sdkInfo: SDKInfo;
}

export default class BaseClient {
  private host: string;
  private port: number;
  private serviceName: string;
  private serviceVersion: string;
  private instanceId: string;
  private sdkInfo: SDKInfo;

  constructor(options?: BaseClientOptions) {
    this.host = options.host;
    this.port = options.port
    this.serviceName = options.serviceName;
    this.serviceVersion = options.serviceVersion;
    this.instanceId = options.instanceId;
    this.sdkInfo = options.sdkInfo;
  }

  /**
   * Make a HTTPS request to a service running on Elements.
   * It will construct a valid elements URL from its serviceName, serviceVersion,
   * and instanceId that were passed to the Instance at construction time.
   */
  request(options: RequestOptions): Promise<IncomingMessageWithBody> {
    var headers: any = this.sdkInfo.headers;

    if (options.headers) {
      for (var key in options.headers) {
        headers[key] = options.headers[key];
      }
    }
    if (options.jwt) {
      headers['Authorization'] = `Bearer ${options.jwt}`
    }

    const path = this.sanitizePath(`services/${this.serviceName}/${this.serviceVersion}/${this.instanceId}/${options.path}`);

    const host = formatURL({
      protocol: 'https',
      hostname: this.host,
      port: this.port,
      pathname: path
    });

    return new Promise<IncomingMessageWithBody>((resolve, reject) => {
      HttpRequest(host, {
        body: JSON.stringify(options.body),
        headers: headers,
        method: options.method,
        qs: options.qs,
        useQuerystring: options.useQuerystring || false,
        forever: true
      }, (error, response, body) => {
        if(error) {
          reject(error);
        }
        else {
          let statusCode = response.statusCode;

          if(statusCode >= 200 && statusCode <= 299) {
            response.body = body;
            resolve(response);
          }
          else if (statusCode >= 300 && statusCode <= 399) {
            reject(new Error(`Unsupported Redirect Response: ${statusCode}`));
          }
          else if (statusCode >= 400 && statusCode <= 599) {
            const { statusCode, headers } = response;

            let errJson;
            try {
              errJson = JSON.parse(body);
            } catch (_) {
              return reject(new ErrorResponse({
                error: 'Something went wrong, but could not parse the response',
                error_description: '',
                status: statusCode
              }));
            }
            const { error, error_description, error_uri } = errJson;
            reject(new ErrorResponse({
              error,
              error_description,
              error_uri,
              headers,
              status: statusCode,
            }));
          } else {
            reject(new Error(`Unsupported Response Code: ${statusCode}`));
          }
        }
      });
    });
  }

  //Cleans up the path provided
  private sanitizePath(path: string): string {
    return path
      .replace(/\/ /g, "/") //Replace space after a slash
      .replace(/ $/, "") //Remove the trailing space
      .replace(/[\/]{2,}/g, "/") //Multiple slashes are now single slashes
      .replace(/\/$/, ""); //Remove trailing slash
  }
}
