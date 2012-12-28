var webdriver = require("webdriver.js").webdriver,
http = require("http"),
url = require("url"),
path = require("path"),
base64_arraybuffer = require('base64-arraybuffer'),
PNG = require('png-js'),
fs = require("fs");


function createServer(port) {
  return http.createServer(function(request, response) {
    var uri = url.parse(request.url).pathname,
    filename = path.join(process.cwd(), "../" + uri);

    fs.exists(filename, function(exists) {
      if(!exists) {
        response.writeHead(404, {
          "Content-Type": "text/plain"
        });
        response.write("404 Not Found\n");
        response.end();
        return;
      }

      if (fs.statSync(filename).isDirectory()) filename += '/index.html';

      fs.readFile(filename, "binary", function(err, file) {
        if(err) {
          response.writeHead(500, {
            "Content-Type": "text/plain"
          });
          response.write(err + "\n");
          response.end();
          return;
        }

        response.writeHead(200);
        response.write(file, "binary");
        response.end();
      });
    });

  }).listen(port);
}

function walkDir(dir, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walkDir(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
};

function getPixelArray(base64, func) {
  var arraybuffer = base64_arraybuffer.decode(base64);
  (new PNG(arraybuffer)).decode(func);
}


function testPage(browser, url, done) {

  browser.url(url)
  .$(".html2canvas", 5000, function(){
    this.execute(function(){
      var canvas = $('.html2canvas')[0];
      return canvas.toDataURL("image/png").substring(22);
    },[], function(dataurl) {
      getPixelArray(dataurl, function(h2cPixels) {
        browser.screenshot(function(base64){
          getPixelArray(base64, function(screenPixels) {
            var len = h2cPixels.length, index = 0, diff = 0;
            for (; index < len; index++) {
              if (screenPixels[index] - h2cPixels[index] !== 0) {
                diff++;
              }
            }
            done(100 - (Math.round((diff/h2cPixels.length) * 10000) / 100));
          });
        })
      });
    });
  });
}

function runBrowsers(pages){

  var port = 5555,
  stats = {},
  browsers = ["chrome", "firefox", "internet explorer"],
  browsersDone = 0,
  server = createServer(port),
  numPages = pages.length;

  var browserDone = function() {
    if (++browsersDone >= browsers.length) {
      server.close();
      console.log(stats);
    }
  };

  browsers.forEach(function(browserName){
    var browser = new webdriver({
      browser: browserName
    }),
    browserType;

    browser.status(function(browserInfo){
      browserType = [browserName, browser.version, browserInfo.os.name.replace(/\s+/g, "-").toLowerCase()].join("-");
      var date = new Date(),
      obj = {
        tests: {},
        date: date.toISOString()
      };
      stats[browserType] = obj;
      stats[browserName] = obj;
      processPage(0);
    });

    function processPage(index) {
      var page = pages[index++];
      testPage(browser, "http://localhost:" + port + "/tests/" + page + "?selenium", function(result) {
        if (numPages > index) {
          processPage(index);
        } else {
          browser.close(browserDone);
        }
        stats[browserType].tests[page] = result;
      });
    }

  });
}

walkDir("cases", function(err, results) {
  if (err) throw err;
  runBrowsers(results);
});
