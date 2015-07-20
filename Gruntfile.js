/**
 * Gruntfile for freedom-social-wechat
 *
 * This repository allows WeChat to be used
 * as a freedomjs social provider.
 **/

var path = require('path');
var freedomChromePath = path.dirname(require.resolve(
  'freedom-for-chrome/package.json'));
var freedomFirefoxPath = path.dirname(require.resolve(
  'freedom-for-firefox/package.json'));

module.exports = function(grunt) {
  grunt.initConfig({
    // NOTE - some copy commands are written in order, i.e. depend on previous
    copy: {
      dist: {
        src: ['src/*.js*'],
        dest: 'dist/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedom: {
        src: [require.resolve('freedom')],
        dest: 'build/demo/webapp/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedomForChrome: {
        cwd: freedomChromePath,
        src: ['freedom-for-chrome.js*'],
        dest: 'build/demo/chrome_app/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedomForFirefox: {
        cwd: freedomFirefoxPath,
        src: ['freedom-for-firefox.jsm'],
        dest: 'build/demo/firefox_addon/data/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      demoMain: {
        cwd: 'src/demo/',
        src: ['**/**'],
        dest: 'build/demo/',
        flatten: false,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      chromeDemo: {
        src: ['dist/*.js*', 'build/demo/common/*'],
        dest: 'build/demo/chrome_app/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      webappDemo: {
        src: ['dist/*.js*', 'build/demo/common/*'],
        dest: 'build/demo/webapp/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      firefoxDemo: {
        src: ['build/demo/webapp/*'],
        dest: 'build/demo/firefox_addon/data/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },

      simple_chrome: {
        cwd: 'node_modules',
        src: ['freedom-for-chrome/**/*'],
        dest: 'build/demo/simple_chrome/',
        flatten: false,
        expand: true,
        onlyIf: 'modified'
      }
    },

    browserify: {
      dist: {
        src: ['src/wechat-social-provider.js'],
        dest: 'dist/wechat-social-provider.static.js'
      },
      simple_chrome: {
        src: ['src/demo/simple_chrome/background.core-env.js'],
        dest: 'build/demo/simple_chrome/background.core-env.static.js'
      }
    },

    jshint: {
      all: ['src/**/*.js'],
      options: {
        jshintrc: true
      }
    },

    connect: {
      demo: {
        options: {
          port: 8000,
          keepalive: true,
          base: ['./', 'build/demo/webapp'],
          open: 'http://localhost:8000/main.html'
        }
      }
    },

    clean: ['build/', 'dist/']
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-browserify');

  grunt.registerTask('build', [
    'jshint',
    'browserify',
    'copy'
  ]);
  grunt.registerTask('webapp_demo', [
    'build',
    'connect'
  ]);
  grunt.registerTask('default', [
    'build'
  ]);

}
