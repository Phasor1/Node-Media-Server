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
const logFile = __dirname + '/logs/trans_session_log.txt';
const logFilePerformances = __dirname + '/logs/trans_session_perf_log.txt';
const request = require('request');

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.readyArgv = [];
    this.ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
    this.urlsPCInfo = 'http://localhost:' + this.conf.port + '/api/server';
    this.timerPCInfo = null;
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
    if(this.conf.writeLog){
      this.timerPCInfo = setInterval(() => {
        request.get(this.urlsPCInfo, (err, res, data) => {
          if(err === null){
            this.savePerformanceData(JSON.parse(data));
          }
        }).auth('admin', 'nms2018');
      }, 1000);
    }
    // fetch(this.urlsPCInfo, {
    //   headers: new Headers({
    //    'Authorization': 'Basic '+btoa('admin:nms2018'), 
    //    'Content-Type': 'application/x-www-form-urlencoded'
    //  }), 
    //   method: 'GET',
    // })
    //   .then(r => r.json())
    //   .catch(e => console.log('error', e))
    //   .then(r => console.log(r));
    // this.timerPCInfo = setInterval(()=>{
      
    // }, 200)
  }
  savePerformanceData(d){
    let nDec = 3
    let divide = (data, n, nDec) => (data/((1000*n))).toFixed(nDec) 
    d.cpu.speed = divide(d.cpu.speed, 1, nDec);
    d.mem.totle = divide(d.mem.totle, 3, nDec); 
    d.mem.free = divide(d.mem.free, 3, nDec);
    d.net.inbytes = divide(d.net.inbytes, 3, nDec);
    d.net.outbytes = divide(d.net.outbytes, 3, nDec);
    d.nodejs.mem.rss = divide(d.nodejs.mem.rss, 3, nDec);
    d.nodejs.mem.heapTotal = divide(d.nodejs.mem.heapTotal, 3, nDec);
    d.nodejs.mem.heapUsed = divide(d.nodejs.mem.heapUsed, 3, nDec);
    d.nodejs.mem.external = divide(d.nodejs.mem.external, 3, nDec);
    fs.appendFileSync(logFilePerformances, this.getStartLogObj() + '{performances: ' + JSON.stringify(d) + '}');
  }
  launchFFMPEGProcess(){
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, this.readyArgv);
    if(this.conf.writeLog){
      fs.stat(logFile, (err, state) => {
        if(err !== null){
          fs.appendFileSync(logFile, "{log:");
        }
      })
    }
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
      if(this.conf.writeLog) {fs.appendFileSync(logFile, this.getStartLogObj() + '[ERROR] ' + Buffer.from(e).toString());}
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
      if(this.conf.writeLog) {fs.appendFileSync(logFile, this.getStartLogObj() + '[DATA] '  + Buffer.from(data).toString());}
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
      if(this.conf.writeLog) {fs.appendFileSync(logFile, this.getStartLogObj() + '[STDERR] '  + Buffer.from(data).toString());}
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      if(code !== null){
        if(this.conf.writeLog) {fs.appendFileSync(logFile, this.getStartLogObj() + '[END] '  + code.toString());}
      }
      if(this.conf.keepAliveFFMPEG){
        this.clearFiles();
        spawn('killall', ['ffmpeg'])
        // this.launchFFMPEGProcess();
      }else{
        this.end();
      }
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
    this.ffmpeg_exec.on('close',()=>{});
    this.ffmpeg_exec.kill();
    this.emit('end');
  }
}

module.exports = NodeTransSession;