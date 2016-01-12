/*
 * Copyright 2014-2016 Red Hat, Inc. and/or its affiliates
 * and other contributors as indicated by the @author tags.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import browsersync from 'browser-sync';
import concat from 'gulp-concat';
import express from 'express';
import eventStream  from 'event-stream';
import fs from 'fs';
import gulp from 'gulp';
import gutil from 'gulp-util';
import less from 'gulp-less';
import map from 'vinyl-map';
import merge from 'merge2';
import notify from 'gulp-notify';
import path from 'path';
import rename from  'gulp-rename';
import s from  'underscore.string';
import size from 'gulp-size';
import ts from 'gulp-typescript';
import tslint from  'gulp-tslint';
import uglify from 'gulp-uglify';
import wiredeps from 'wiredep';

import pkg from './package.json';

const wiredep = wiredeps.stream;

let server;

const config = {
  main: '.',
  ts: ['src/**/*.ts'],
  less: ['src/**/*.less'],
  js: pkg.name + '.js',
  tsProject: ts.createProject({
    target: 'ES5',
    module: 'commonjs',
    declarationFiles: true,
    noExternalResolve: false
  })
};

const normalSizeOptions = {
  showFiles: true
}, gZippedSizeOptions = {
  showFiles: true,
  gzip: true
};

gulp.task('bower', () => {
  gulp.src('index.html')
    .pipe(wiredep({}))
    .pipe(gulp.dest('.'));
});

/** Adjust the reference path of any typescript-built plugin this project depends on */
gulp.task('path-adjust', () => {
  gulp.src('libs/**/includes.d.ts')
    .pipe(map((buf, filename) => {
      const textContent = buf.toString();
      const newTextContent = textContent.replace(/"\.\.\/libs/gm, '"../../../libs');
      //console.log("Filename: ", filename, " old: ", textContent, " new:", newTextContent);
      return newTextContent;
    }))
    .pipe(gulp.dest('libs'));
});


gulp.task('tsc-prod', [], () => {
  const cwd = process.cwd();
  let tsResult = gulp.src(config.ts)
    .pipe(ts(config.tsProject))
    .on('error', notify.onError({
      message: '<%= error.message %>',
      title: 'Typescript compilation error'
    }));

  return eventStream.merge(
    tsResult.js
      .pipe(concat(config.js))
      .pipe(gulp.dest('.'))
      .pipe(uglify())
      .pipe(rename('hawkular-charts.min.js'))
      .pipe(gulp.dest('.')),

    tsResult.dts
      .pipe(gulp.dest('d.ts')))
    .pipe(map((buf, filename) => {
      if (!s.endsWith(filename, 'd.ts')) {
        return buf;
      }
      const relative = path.relative(cwd, filename);
      fs.appendFileSync('defs.d.ts', '/// <reference path="' + relative + '"/>\n');
      return buf;
    }));
});

gulp.task('tsc-dev', [], () => {
  const cwd = process.cwd();
  let tsResult = gulp.src(config.ts)
    .pipe(ts(config.tsProject))
    .on('error', notify.onError({
      message: '<%= error.message %>',
      title: 'Typescript compilation error'
    }));

  return eventStream.merge(
    tsResult.js
      .pipe(concat(config.js))
      .pipe(gulp.dest('.'))
      .pipe(reload()),

    tsResult.dts
      .pipe(gulp.dest('d.ts')))
    .pipe(map((buf, filename) => {
      if (!s.endsWith(filename, 'd.ts')) {
        return buf;
      }
      const relative = path.relative(cwd, filename);
      fs.appendFileSync('defs.d.ts', '/// <reference path="' + relative + '"/>\n');
      return buf;
    }));
});


gulp.task('tslint', () => {
  gulp.src(config.ts)
    .pipe(tslint())
    .pipe(tslint.report('verbose'));
});


gulp.task('less', () => {
  gulp.src(config.less)
    .pipe(less())
    .pipe(concat('css/hawkular-charts.css'))
    .pipe(gulp.dest('.'))
    .pipe(reload());
});


gulp.task('concat', () => {
  const gZipSize = size(gZippedSizeOptions);
  return gulp.src([config.js])
    .pipe(concat(config.js))
    .pipe(size(normalSizeOptions))
    .pipe(gZipSize);
});


gulp.task('server', ['build', 'watch'], () => {
  server = express();
  server.use(express.static('.'));
  server.listen(8000);
  browsersync({proxy: 'localhost:8000'})
});

gulp.task('dev-build', ['bower', 'path-adjust', 'less', 'tslint', 'tsc-dev', 'concat' ]);

gulp.task('watch', () => {
  gulp.watch(config.less, ['less']);
  gulp.watch(config.ts, ['tsc-dev']);
});


gulp.task('build', ['bower', 'path-adjust', 'less', 'tslint', 'tsc-prod', 'concat']);
gulp.task('default', ['server']);


function reload() {
  if (server) {
    return browsersync.reload({stream: true});
  }
  return gutil.noop();
}
