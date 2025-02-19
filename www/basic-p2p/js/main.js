/***
 * Excerpted from "Programming WebRTC",
 * published by The Pragmatic Bookshelf.
 * Copyrights apply to this code. It may not be used to create training material,
 * courses, books, articles, and the like. Contact us if you are in doubt.
 * We make no guarantees that this code is fit for any purpose.
 * Visit https://pragprog.com/titles/ksrtc for more book information.
***/
'use strict';
const namespace = prepareNamespace(window.location.hash, true);

const VideoFX = class {
	constructor() {
		this.filters = ['grayscale', 'sepia', 'noir', 'psychedelic', 'none'];
	}
	cycleFilter() {
		const filter = this.filters.shift();
		this.filters.push(filter);
		return filter;
	}
};

/**
 *  Global Variables: $self and $peer
 */
const $self = { 
	rtcConfig: null,
	isPolite: false,
	isMakingOffer: false,
	isIgnoringOffer: false,
	isSettingRemoteAnswerPending: false,
	mediaConstraints: {audio: false, video: true }, };
	
const $peer = { connection : new RTCPeerConnection($self.rtcConfig), };


/**
 *  Signaling-Channel Setup
 */
const sc = io.connect('/' + namespace, { autoConnect: false });

registerScCallbacks();


/**
 * =========================================================================
 *  Begin Application-Specific Code
 * =========================================================================
 */



/**
 *  User-Interface Setup
 */
 document.querySelector('#header h1')
	.innerText = 'Welcome to Room #' + namespace;
	
document.querySelector('#call-button')
	.addEventListener('click', handleCallButton);
	
document.querySelector('#chat-form')
	.addEventListener('submit', handleMessageForm);


/**
 *  User-Media Setup
 */
requestUserMedia($self.mediaConstraints);

$self.filters = new VideoFX();

$self.messageQueue = [];

document.querySelector('#self')
	.addEventListener('click', handleSelfVideo);
	
	
function handleSelfVideo(event) {
	if ($peer.connection.connectionState !== 'connected') return;
	const filter = `filter-${$self.filters.cycleFilter()}`;
	const fdc = $peer.connection.createDataChannel(filter);
	fdc.onclose = function() {
		console.log(`Remote peer has closed the ${filter} data channel`);
	};
	event.target.className = filter;
}


/**
 *  User-Interface Functions and Callbacks
 */



/**
 *  User-Media Functions
 */
function handleCallButton(event) {
	const call_button = event.target;
	if (call_button.className === 'join') {
		console.log('Joining the call...');
		call_button.className = 'leave';
		call_button.innerText = 'Leave Call';
		joinCall();
	} 
	else {
		console.log('Leaving the call...');
		call_button.className = 'join';
		call_button.innerText = 'Join Call';
		leaveCall();
	}
}

function joinCall(){
	sc.open();
}

function leaveCall(){
	sc.close();
	resetPeer($peer);
}

async function requestUserMedia(media_constraints) {
	$self.mediaStream = new MediaStream();
	$self.media = await navigator.mediaDevices
		.getUserMedia(media_constraints);
	$self.mediaStream.addTrack($self.media.getTracks()[0]);
	displayStream($self.mediaStream, '#self');
}

function displayStream(stream, selector) {
	document.querySelector(selector).srcObject = stream;
}

//Negotiated data channel for chat

function addChatChannel(peer) {
	peer.chatChannel =
		peer.connection.createDataChannel('text chat',
			{ negotiated: true, id: 100 });
		peer.chatChannel.onmessage = function(event) {
			appendMessage('peer', '#chat-log', event.data);
		};
		peer.chatChannel.onclose = function() {
			console.log('Chat channel closed.');
		};
		peer.chatChannel.onopen = function() {
	console.log('Chat channel opened.');
	while ($self.messageQueue.length > 0 &&
			peer.chatChannel.readyState === 'open') {
		console.log('Attempting to send a message from the queue...');
		// get the message at the front of the queue:
		let message = $self.messageQueue.shift();
		sendOrQueueMessage(peer, message, false);
		}
	};
}

/**
 *  Call Features & Reset Functions
 */
function establishCallFeatures(peer) {
	registerRtcCallbacks(peer);
	addChatChannel(peer);
	addStreamingMedia($self.mediaStream, peer);
}

function resetPeer(peer) {
	displayStream(null, '#peer');
	peer.connection.close();
	peer.connection = new RTCPeerConnection($self.rtcConfig);
}


/**
 *  WebRTC Functions and Callbacks
 */
 function registerRtcCallbacks(peer) {
	peer.connection.onnegotiationneeded = handleRtcConnectionNegotiation;
	peer.connection.onicecandidate = handleRtcIceCandidate;
	peer.connection.ontrack = handleRtcPeerTrack;
	peer.connection.onconnectionstatechange = handleRtcConnectionStateChange;
	peer.connection.ondatachannel = handleRtcDataChannel;
}

function handleRtcPeerTrack({ track, streams: [stream] }) {
	console.log('Attempt to display media from peer...');
	displayStream(stream, '#peer');
}

function handleRtcConnectionStateChange() {
	const connection_state = $peer.connection.connectionState;
	console.log(`The connection state is now ${connection_state}`);
	document.querySelector('body').className = connection_state;
}

function handleRtcDataChannel({ channel }) {
	const label = channel.label;
	console.log(`Data channel added for ${label}`);
	if (label.startsWith('filter-')) {
		document.querySelector('#peer').className = label;
		channel.onopen = function() {
			channel.close();
		};
	}
}

/**
 * Chat related callbacks
 */
 
 function handleMessageForm(event) {
	event.preventDefault();
	const input = document.querySelector('#chat-msg');
	const message = input.value;
	if (message === '') return;
	appendMessage('self', '#chat-log', message);
	sendOrQueueMessage($peer, message); //relaying message to peer
	input.value = '';
}

/**
 * =========================================================================
 *  End Application-Specific Code
 * =========================================================================
 */



/**
 *  Reusable WebRTC Functions and Callbacks
 */
async function handleRtcConnectionNegotiation() {
	$self.isMakingOffer = true;
	console.log('Attempting to make an offer...');
	await $peer.connection.setLocalDescription();
	sc.emit('signal', { description: $peer.connection.localDescription });
	$self.isMakingOffer = false;
}
function handleRtcIceCandidate({ candidate }) {
	console.log('Attempting to handle an ICE candidate...');
	sc.emit('signal', { candidate: candidate });
}


/**
 *  Signaling-Channel Functions and Callbacks
 */
 function registerScCallbacks() {
	sc.on('connect', handleScConnect);
	sc.on('connected peer', handleScConnectedPeer);
	sc.on('disconnected peer', handleScDisconnectedPeer);
	sc.on('signal', handleScSignal);
}
function handleScConnect() {
	console.log('Successfully connected to the signaling server!');
	establishCallFeatures($peer);
}
function handleScConnectedPeer() {
	$self.isPolite = true;
}
function handleScDisconnectedPeer() {
	resetPeer($peer);
	establishCallFeatures($peer);
}
async function handleScSignal({ description, candidate }) {
	if (description) {
		const ready_for_offer =
					!$self.isMakingOffer &&
					($peer.connection.signalingState === 'stable'
						|| $self.isSettingRemoteAnswerPending);
						
		const offer_collision =
					description.type === 'offer' && !ready_for_offer;
					
		$self.isIgnoringOffer = !$self.isPolite && offer_collision;
		if ($self.isIgnoringOffer) {
			return;
		}
		$self.isSettingRemoteAnswerPending = description.type === 'answer';
		await $peer.connection.setRemoteDescription(description);
		$self.isSettingRemoteAnswerPending = false;
		if (description.type === 'offer') {
			await $peer.connection.setLocalDescription();
			sc.emit('signal', { description: $peer.connection.localDescription });
		}
	}
	else if (candidate) {
	// Handle ICE candidates
		try {
			await $peer.connection.addIceCandidate(candidate);
		} 
		catch(e) {
			// Log error unless $self is ignoring offers
			// and candidate is not an empty string
			if (!$self.isIgnoringOffer && candidate.candidate.length > 1) {
				console.error('Unable to add ICE candidate for peer:', e);
			}
		}
	}
}



/**
 *  Utility Functions
 */
function prepareNamespace(hash, set_location) {
	let ns = hash.replace(/^#/, ''); // remove # from the hash
	if (/^[0-9]{7}$/.test(ns)) {
		console.log('Checked existing namespace', ns);
		return ns;
	}
	ns = Math.random().toString().substring(2, 9);
	console.log('Created new namespace', ns);
	if (set_location) window.location.hash = ns;
		return ns;
}

function addStreamingMedia(stream, peer) {
if (stream) {
	for (let track of stream.getTracks()) {
		peer.connection.addTrack(track, stream);
		}
	}
}

function appendMessage(sender, log_element, message) {
	const log = document.querySelector(log_element);
	const li = document.createElement('li');
	li.className = sender;
	li.innerText = message;
	log.appendChild(li);
	
	//Automatic scroll to bottom
	if (log.scrollTo) {
		log.scrollTo({
			top: log.scrollHeight,
			behavior: 'smooth',
	});
	} 	else {
		log.scrollTop = log.scrollHeight;
	}
}

function queueMessage(message, push=true) {
	if (push) $self.messageQueue.push(message);
	else $self.messageQueue.unshift(message); // queue at the start
}

function sendOrQueueMessage(peer, message, push=true) {
	const chat_channel = peer.chatChannel;
	if (!chat_channel || chat_channel.readyState !== 'open') {
		queueMessage(message, push);
		return;
	}
	try {
		chat_channel.send(message);
	} catch(e) {
		console.error('Error sending message:', e);
		queueMessage(message, push);
	}
}
