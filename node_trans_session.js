//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');
const logFile = __dirname + '\\logs\\trans_session_log.txt';

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.readyArgv = [];
    this.ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
  }
  getHumanTs(){
    let now = new Date();
    return now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  }
  getStartLogObj(){
    return '\n' + this.getHumanTs() + ': ';
  }

  run() {
    let vc = this.conf.vc || 'copy';
    let ac = this.conf.ac || 'copy';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.rtmpPort + this.conf.streamPath;
    let mapStr = '';

    if (this.conf.rtmp && this.conf.rtmpApp) {
      if (this.conf.rtmpApp === this.conf.streamApp) {
        Logger.error('[Transmuxing RTMP] Cannot output to the same app.');
      } else {
        let rtmpOutput = `rtmp://127.0.0.1:${this.conf.rtmpPort}/${this.conf.rtmpApp}/${this.conf.streamName}`;
        mapStr += `[f=flv]${rtmpOutput}|`;
        Logger.log('[Transmuxing RTMP] ' + this.conf.streamPath + ' to ' + rtmpOutput);
      }
    }
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM') + '.mp4';
      let mapMp4 = `${this.conf.mp4Flags}${this.ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + this.ouPath + '/' + mp4FileName);
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.conf.hlsFlags ? this.conf.hlsFlags : '';
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${this.ouPath}/${hlsFileName}|`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + this.ouPath + '/' + hlsFileName);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${this.ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + this.ouPath + '/' + dashFileName);
    }
    mkdirp.sync(this.ouPath);
    let argv = ['-y', '-fflags', 'nobuffer', '-i', inPath];
    Array.prototype.push.apply(argv, ['-c:v', vc]);
    Array.prototype.push.apply(argv, this.conf.vcParam);
    Array.prototype.push.apply(argv, ['-c:a', ac]);
    Array.prototype.push.apply(argv, this.conf.acParam);
    Array.prototype.push.apply(argv, ['-f', 'tee', '-map', '0:a?', '-map', '0:v?', mapStr]);
    this.readyArgv = argv.filter((n) => { return n }); //去空
    this.launchFFMPEGProcess();
  }
  launchFFMPEGProcess(){
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, this.readyArgv);
    if(fs.stat(logFile, (err, state) => {
      if(err !== null){
        fs.appendFileSync(logFile, "{log:");
      }
    }))
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
      fs.appendFileSync(logFile, this.getStartLogObj() + '[ERROR] ' + Buffer.from(e).toString());
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
      fs.appendFileSync(logFile, this.getStartLogObj() + '[DATA] '  + Buffer.from(data).toString());
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
      fs.appendFileSync(logFile, this.getStartLogObj() + '[STDERR] '  + Buffer.from(data).toString());
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      if(code !== null){
        fs.appendFileSync(logFile, this.getStartLogObj() + '[END] '  + code.toString());
      }
      this.launchFFMPEGProcess();
    });
  }
  clearFiles(){
    fs.readdir(this.ouPath, (err, files) => {
      if (!err) {
        files.forEach((filename) => {
          if (filename.endsWith('.ts')
            || filename.endsWith('.m3u8')
            || filename.endsWith('.mpd')
            || filename.endsWith('.m4s')
            || filename.endsWith('.tmp')) {
            fs.unlinkSync(this.ouPath + '/' + filename);
          }
        })
      }
    });
  }

  end() {
    this.clearFiles();
    this.emit('end');
    this.ffmpeg_exec.on('close',()=>{});
    this.ffmpeg_exec.kill();
  }
}

module.exports = NodeTransSession;