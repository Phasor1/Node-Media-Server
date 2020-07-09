//
// class that checks if some streams is missing, and then, if cameras are reachable with PING, restart server
//
const ping = require('ping');
const {spawn} = require('child_process');
var needle = require('needle');
const EventEmitter = require('events');
require('dotenv').config()

class DiagnosticCameras extends EventEmitter{
	constructor(config){
		super();
		console.log('starting diagnostic cameras')
		this.config = config;
		this.timerStreams = null;
		this.streams = config.relay.tasks.map(el => el.edge);
		this.hosts = [];
		this.ipRegex = '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
		this.credentialsRegex = '(?<=\/\/)(.*)(?=@)';
		this.timerDuration = 2000;
		this.restartDuration = 150000;
		this.numAttempts = 0;
		this.numMaxAttempts = 5;
		this.canCheck = true;
		this.apiEndP = 'http://localhost:5070/api/streams';
		this.streams.forEach(el => {
			let addr = this.getIpFromUrl(el);
			if(this.hosts.indexOf(addr) === -1) this.hosts.push(addr)
		})
		this.minStreams = (this.streams.length*2)+1;
		this.cameraCredentials = {
			usr: 'root',
			pwd: 'ecotender'
		}
		this.startTimerApiStreams();
		//setTimeout(() => {this.restartServer()}, 10000)
	}
	getIpFromUrl(url){
		return url.match(this.ipRegex)[0]
	}
	checkIps(){
		let alives = [];
	    this.hosts.forEach((host, i) => {
	        ping.sys.probe(host, isAlive => {
	            if(isAlive) {
	            	alives.push(host);
	            }
	            console.log('alives', this.hosts, alives)
	            if(i == this.hosts.length - 1 && this.hosts.length == alives.length){
	            	console.log('restarting', this.hosts, alives)
	            	this.restartServer();
	            }        
	        });
	    });
	}
	restartServer(){
		spawn(process.env.SCRIPT_FOLDER + '/restart_pm2_streaming');
	}
	restartCameras(){
		console.log('restart cameras')
		this.hosts.forEach(ip => {
			spawn('curl', '--digest -u "root:ecotender" http://' + ip + '/axis-cgi/restart.cgi');
		})
		this.canCheck = false;
		setTimeout(() => {	
			this.canCheck = true;
		}, this.restartDuration)
	}
	startTimerApiStreams(){
		this.timerStreams = setInterval(() => {
			if(this.canCheck){
				needle.get(this.apiEndP, (error, res) => {
				  	if (!error && res.statusCode == 200){
				  		let streams = res.body.cruiseplatform;
				  		if(streams === undefined){
				  			this.numAttempts++;
				  			if(this.numAttempts == this.numMaxAttempts){
				  				console.log('streams api response is empty')
				  				this.numAttempts = 0;
				  				this.checkIps();
				  			}
				  		}else{
					  		let streamsKeys = Object.keys(streams);
					  		let currNumStreams = 0;
				            streamsKeys.forEach(stream => {
				                if(!this.isEmpty(streams[stream].publisher)) {
				                    currNumStreams++;
				                }
				            });
					  		// we miss a stream, check if cameras are available
					  		if(this.streams.length !== currNumStreams){
					  			console.log('attempt', this.numAttempts)
					  			this.numAttempts++;

					  			if(this.numAttempts == this.numMaxAttempts){
					  				console.log('some streams missing')
					  				this.numAttempts = 0;
					  				this.checkIps();
					  			}
					  		}else{
					  			this.numAttempts = 0;
					  		}
					  	}
				  	}
				});
			}
		}, this.timerDuration)
	}
	stopTimerApiStreams(){
		clearInterval(this.timerStreams);
	}
	timerFromFfmpeg(){
		this.timerStreams = setInterval(() => {
			let ps = spawn('ps', ['-aux'])
			let grep = spawn('grep', ['ffmpeg'])
			ps.stdout.on('data', data => {
			 	grep.stdin.write(data);
			});
			ps.on('close', () => {
				grep.stdin.end();
			})
			grep.stdout.on('data', data => {
			  	let fromGrep = Buffer.from(data).toString();
			  	let strings = fromGrep.split('\n')
			  	strings = strings.filter( el => el !== '')
			  	if(strings.length < this.streams.length){
			  		this.numAttempts++;
			  	}else{
			  		this.numAttempts = 0;
			  	}
			  	// check if camera web card is working
			  	if(this.numAttempts == this.numMaxAttempts){
			  		this.checkIps();
			  	}
			});
		}, this.timerDuration);
	}
	stopTimer(){
		clearInterval(this.timerStreams)
	}
	isEmpty(obj) {
	    for(var key in obj) {
	        if(obj.hasOwnProperty(key))
	            return false;
	    }
	    return true;
	}

}
module.exports = DiagnosticCameras;
// 'curl --digest -u "root:ecotender" http://10.3.3.92/axis-cgi/restart.cgi'
