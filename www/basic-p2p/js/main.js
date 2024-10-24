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


/**
 *  User-Media Setup
 */
requestUserMedia($self.mediaConstraints);



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

/**
 *  Call Features & Reset Functions
 */
function establishCallFeatures(peer) {
	registerRtcCallbacks(peer);
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
}

function handleRtcPeerTrack({ track, streams: [stream] }) {
	console.log('Attempt to display media from peer...');
	displayStream(stream, '#peer');
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
