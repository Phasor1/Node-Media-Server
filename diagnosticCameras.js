//
// class that checks if some streams is missing, and then, if cameras are reachable with PING, restart server
//
const ping = require('ping');
const {spawn} = require('child_process');
var needle = require('needle');

class DiagnosticCameras {
	constructor(config){
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
		this.streams.forEach(el => {
			let addr = this.getIpFromUrl(el);
			console.log(addr)
			if(this.hosts.indexOf(addr) === -1) this.hosts.push(addr)
		})
		this.minStreams = (this.streams.length*2)+1;
		this.cameraCredentials = {
			usr: 'root',
			pwd: 'ecotender'
		}
		this.startTimerApiStreams();
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
	            if(i == this.hosts.length - 1 && this.hosts.length == alives.length){
	            	this.restartCameras()
	            }        
	        });
	    });
	}
	restartCameras(){
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
				needle.get('http://localhost:5070/api/streams', (error, res) => {
				  	if (!error && res.statusCode == 200){
				  		res = res.body;
				  		let numStreams = this.streams.length;
				  		let currNumStreams = 0;
				  		config.relay.tasks.forEach(t => {
				  			let currStream = numStres.body[t.app];
				  			if(currStream !== undefined){
				  				currNumStreams++;
				  			}
				  		})
				  		// we miss a stream, call 
				  		if(numStreams !== currNumStreams){
				  			this.checkIps()
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
}
module.exports = DiagnosticCameras;
// 'curl --digest -u "root:ecotender" http://10.3.3.92/axis-cgi/restart.cgi'
