'use strict';

var Fetcher = function Fetcher() { };

var JSONPScriptDownloader = function JSONPScriptDownloader() {};
JSONPScriptDownloader.prototype.CALLBACK_PREFIX = 'JSONPCallbackX';
JSONPScriptDownloader.prototype.reset =
JSONPScriptDownloader.prototype.stop = function jpf_stop() {
  this.currentRequest = undefined;
  clearTimeout(this.timer);
};
JSONPScriptDownloader.prototype.handleEvent = function(evt) {
  var el = evt.target;
  window[el.getAttribute('data-callback-name')] = undefined;
  this.currentRequest = undefined;
  clearTimeout(this.timer);

  el.parentNode.removeChild(el);

  if (evt.type === 'error') {
    this.fetcher.handleResponse();
  }
};
JSONPScriptDownloader.prototype.getNewCallbackName = function() {
  // Create a unique callback name for this request.
  var callbackName = this.CALLBACK_PREFIX +
    Math.random().toString(36).substr(2, 8).toUpperCase();

  // Install the callback
  window[callbackName] = (function() {
    // Ignore any response that is not coming from the currentRequest.
    if (this.currentRequest !== callbackName) {
      return;
    }
    this.currentRequest = undefined;
    clearTimeout(this.timer);

    // send the callback name and the data back
    this.fetcher.handleResponse.apply(this.fetcher, arguments);
  }).bind(this);

    return callbackName;
  };
JSONPScriptDownloader.prototype.requestData = function(url) {
  var callbackName = this.currentRequest = this.getNewCallbackName();

  url += (url.indexOf('?') === -1) ? '?' : '&';
  url += 'callback=' + callbackName;

  var el = this.scriptElement = document.createElement('script');
  el.src = url;
  el.setAttribute('data-callback-name', callbackName);
  el.addEventListener('load', this);
  el.addEventListener('error', this);

  document.documentElement.firstElementChild.appendChild(el);

  clearTimeout(this.timer);
  this.timer = setTimeout(function jpf_timeout() {
    window[callbackName]();
  }, this.fetcher.TIMEOUT);
};

var JSONPWorkerDownloader = function JSONPWorkerDownloader() {};
JSONPWorkerDownloader.prototype.PATH = './assets/';
JSONPWorkerDownloader.prototype.reset =
JSONPWorkerDownloader.prototype.stop = function jpf_stop() {
  if (!this.worker) {
    return;
  }

  clearTimeout(this.timer);
  this.worker.terminate();
  this.worker = null;
};
JSONPWorkerDownloader.prototype.requestData = function(url) {
  if (this.worker) {
    this.stop();
  }

  this.worker = new Worker(this.PATH + 'downloader-worker.js');
  this.worker.addEventListener('message', this);
  this.worker.addEventListener('error', this);
  this.worker.postMessage(url);

  clearTimeout(this.timer);
  this.timer = setTimeout((function() {
    this.stop();
    this.fetcher.handleResponse();
  }).bind(this), this.fetcher.TIMEOUT);
};
JSONPWorkerDownloader.prototype.handleEvent = function(evt) {
  var data;
  switch (evt.type) {
    case 'message':
      data = evt.data;

      break;

    case 'error':
      data = [];
      // Stop error event on window.
      evt.preventDefault();

      break;
  }
  this.stop();
  this.fetcher.handleResponse.apply(this.fetcher, data);
};

var JSONPFetcher = function JSONPFetcher() {};
JSONPFetcher.prototype = new Fetcher();
JSONPFetcher.prototype.USE_WORKER_WHEN_AVAILABLE = true;
JSONPFetcher.prototype.TIMEOUT = 30 * 1000;
JSONPFetcher.prototype.reset = function jpf_reset() {
  if (this.downloader) {
    this.downloader.reset();
  }
};
JSONPFetcher.prototype.stop = function jpf_stop() {
  if (this.downloader) {
    this.downloader.stop();
  }
  this.downloader = null;
};
JSONPFetcher.prototype.requestData = function jpf_requestJSONData(url) {
  if (this.USE_WORKER_WHEN_AVAILABLE && window.Worker) {
    this.downloader = new JSONPWorkerDownloader();
  } else {
    this.downloader = new JSONPScriptDownloader();
  }

  this.downloader.fetcher = this;
  this.downloader.requestData(url);
};

var FeedFetcher = function FeedFetcher() {
  this.types = ['rss', 'feed'];

  this.params = [
    ['v', '1.0'],
    ['scoring', this.FEED_API_SCORING],
    ['num', this.FEED_API_NUM]
  ];
};
FeedFetcher.prototype = new JSONPFetcher();
FeedFetcher.prototype.FEED_API_LOAD_URL =
  'https://ajax.googleapis.com/ajax/services/feed/load';
FeedFetcher.prototype.FEED_API_CALLBACK_PREFIX = 'FeedFetcherCallback';
FeedFetcher.prototype.FEED_API_NUM = '-1';
FeedFetcher.prototype.FEED_API_SCORING = 'h';
FeedFetcher.prototype.ENTRY_REGEXP =
  /<[^>]+?>|\(.+?\.\.\.\)|\&\w+\;|<script.+?\/script\>/ig;
FeedFetcher.prototype.getData = function rf_getData(dataType, data) {
  var params = [].concat(this.params);

  params.push(['q', data]);
  params.push(['context', 'ctx']);

  var url = this.FEED_API_LOAD_URL + '?' + params.map(function kv(param) {
    return param[0] + '=' + encodeURIComponent(param[1]);
  }).join('&');

  this.requestData(url);
};
FeedFetcher.prototype.handleResponse = function rf_handleResponse(contextValue,
                                                                 responseObject,
                                                                 responseStatus,
                                                                 errorDetails) {
  // Return empty text if we couldn't get the data.
  if (!contextValue || responseStatus !== 200) {
    console.log('');
    return;
  }

  var numbers = {};
  responseObject.feed.entries.forEach((function process(entry) {
    var year = entry.title.substr(0, 3);
    var month = entry.title.substr(4, 2);
    if ((year + month) in numbers) {
      return;
    }

    var obj = numbers[year + month] = {};
    entry.content.split(/<\/?p>/).forEach(function(line) {
      if (!line) {
        return;
      }
      var substrs = line.split(/[：、]/);
      substrs.forEach(function(substr, i) {
        if (i === 0) {
          return;
        }

        if (!(substrs[0] in obj)) {
          obj[substrs[0]] = [];
        }
        obj[substrs[0]].push(substr);
      });
    });
  }).bind(this));
  var pre = document.createElement('pre');
  pre.textContent = JSON.stringify(numbers, null, 2);
  document.body.appendChild(pre);
};

