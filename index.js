/**
 * Module dependencies.
 */

var request = require('request');
var assert = require('assert');
var semver = require('semver');
var ms = require('ms');

/**
 * API url.
 */

var api = 'https://api.github.com';

/**
 * Expose `Client`.
 */

module.exports = Client;

/**
 * Fetch releases with `opts`:
 *
 * - `token` optional github token
 * - `user` optional github user
 * - `pass` optional github pass
 * - `ua` user-agent string [gh]
 *
 * @param {Object} opts
 * @param {Function} fn
 * @api public
 */

function Client(opts) {
  opts = opts || {};
  this.token = opts.token;
  this.user = opts.user;
  this.pass = opts.pass;
  this.ua = opts.ua || 'gh';
}

/**
 * Return request options for `url`.
 *
 * @param {String} str
 * @param {Object} [opts]
 * @return {Object}
 * @api private
 */

Client.prototype.options = function(url, other){
  var token = this.token;
  var user = this.user;
  var pass = this.pass;

  var opts = {
    url: url,
    headers: { 'User-Agent': this.ua }
  };

  if (other) {
    for (var k in other) opts[k] = other[k];
  }

  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (user && pass) opts.headers.Authorization = 'Basic ' + basic(user, pass);

  return opts;
};

/**
 * Return a stream for `repo`'s `path` at `ref`.
 *
 *    gh.stream('component/tip', '1.0.0', 'component.json');
 *
 * @param {String} repo
 * @param {String} ref
 * @param {String} path
 * @return {Request}
 * @api public
 */

Client.prototype.stream = function(repo, ref, path, fn){
  var url = 'https://raw.github.com/' + repo + '/' + ref + '/' + path;
  var opts = this.options(url);
  return request(opts);
};

/**
 * GET the given `path`.
 *
 * @param {String} path
 * @param {Function} fn
 * @api public
 */

Client.prototype.get = function(path, fn){
  var opts = this.options(api + path, { json: true });

  request(opts, function(err, res, body){
    if (err) fn(err);

    var l = ~~res.headers['x-ratelimit-limit'];
    var n = ~~res.headers['x-ratelimit-remaining'];
    var r = ~~res.headers['x-ratelimit-reset'];

    if (0 == n) {
      r = new Date(r * 1000);
      r = ms(r - new Date, { long: true });
      return fn(new Error('ratelimit of ' + l + ' requests exceeded, resets in ' + r));
    }

    fn(null, body);
  });
};

/**
 * Respond with releases for `repo`.
 *
 *   gh.releases('component/tip', fn);
 *
 * @param {String} repo
 * @param {Function} fn
 * @api public
 */

Client.prototype.releases = function(repo, fn){
  this.get('/repos/' + repo + '/tags', fn);
};

/**
 * Get contents of `path` at `ref.
 *
 *   gh.contents('component/tip' '1.0.0', 'component.json', fn);
 *
 * @param {String} repo
 * @param {String} ref
 * @param {String} path
 * @param {Function} fn
 * @api public
 */

Client.prototype.contents = function(repo, ref, path, fn){
  var path = '/repos/' + repo + '/contents/' + path + '?ref=' + ref;
  this.get(path, fn);
};

/**
 * Lookup semver release of `repo` at the given `version`.
 *
 *   gh.lookup('component/tip', '1.x', fn);
 *
 * @param {String} repo
 * @param {String} version
 * @param {Function} fn
 * @api public
 */

Client.prototype.lookup = function(repo, version, fn){
  this.releases(repo, function(err, tags){
    if (err) return fn(err);

    try {
      var tag = find(tags, version);
    } catch (err) {
      return fn(err);
    }

    fn(null, tag);
  });
};

/**
 * Return base64 encoded basic auth.
 */

function basic(user, pass) {
  return new Buffer(user + ':' + pass).toString('base64');
}

/**
 * Find a release in `tags` that satisfies `version`.
 */

function find(tags, version) {
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    if (semver.satisfies(tag.name, version)) {
      return tag;
    }
  }
}