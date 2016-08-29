
document.addEventListener("DOMContentLoaded", function () {
  let wsUrl = 'ws://localhost:3001/';
  let ws = new WebSocket(wsUrl);
  ws.onopen = function (evt) {
    console.log('ws open()');
  };
  ws.onerror = function (err) {
    console.error('ws onerror() ERR:', err);
  };
  ws.onmessage = function (evt) {
    console.log('ws onmessage() data:', evt.data);
    let message = JSON.parse(evt.data);
    if (message.type === 'offer') {
      // -- got offer ---
      console.log('Received offer ...');
      textToReceiveSdp.value = message.sdp;
      let offer = new RTCSessionDescription(message);
      setOffer(offer);
    }
    else if (message.type === 'answer') {
      // --- got answer ---
      console.log('Received answer ...');
      textToReceiveSdp.value = message.sdp;
      let answer = new RTCSessionDescription(message);
      setAnswer(answer);
    } else if (message.type === 'candidate') {
      // --- got ICE candidate ---
      console.log('Received ICE candidate ...');
      let candidate = new RTCIceCandidate(message.ice);
      console.log(candidate);
      addIceCandidate(candidate);
    }
  };

  document.querySelector('.connect').addEventListener('click', connect, false);
  document.querySelector('.hangup').addEventListener('click', hangUp, false);
  document.querySelector('.receive').addEventListener('click', onSdpText, false);
  document.querySelector('.send').addEventListener('click', sendMessage, false);

  let dataChannel = null;
  let peerConnection = null;
  let textForSendSdp = document.getElementById('text_for_send_sdp');
  let textToReceiveSdp = document.getElementById('text_for_receive_sdp');

  // --- prefix -----
  RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;

  // ----- hand signaling ----
  function onSdpText() {
    let text = textToReceiveSdp.value;
    if (peerConnection) {
      console.log('Received answer text...');
      let answer = new RTCSessionDescription({
        type: 'answer',
        sdp: text,
      });
      setAnswer(answer);
    }
    else {
      console.log('Received offer text...');
      let offer = new RTCSessionDescription({
        type: 'offer',
        sdp: text,
      });
      setOffer(offer);
    }
    textToReceiveSdp.value = '';
  }

  function sendSdp(sessionDescription) {
    console.log('---sending sdp ---');

    textForSendSdp.value = sessionDescription.sdp;

    // --- シグナリングサーバーに送る ---
    let message = JSON.stringify(sessionDescription);
    console.log('sending SDP=' + message);
    ws.send(message);
  }

  // ---------------------- connection handling -----------------------
  function prepareNewConnection() {
    let pc_config = { "iceServers": [] };
    let peer = new RTCPeerConnection(pc_config);

    // --- on get local ICE candidate
    peer.onicecandidate = function (evt) {
      console.count("onicecandidate");
      if (evt.candidate) {
        console.log(evt.candidate);

        // Trickle ICE の場合は、ICE candidateを相手に送る
        sendIceCandidate(evt.candidate);
      } else {
        console.log('empty ice event');

        // Trickle ICE の場合は、何もしない
      }
    };

    console.log('Creating Data Channel');
    dataChannel = peer.createDataChannel('gamedata');
    onDataChannelCreated(dataChannel);
    peer.ondatachannel = function (event) {
      console.log('ondatachannel:', event.channel);
      dataChannel = event.channel;
      onDataChannelCreated(dataChannel);
    };
    return peer;
  }

  function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function () {
      console.log('CHANNEL opened!!!');
    };

    channel.onmessage = receiveDataChromeFactory();
  }

  function receiveDataChromeFactory() {
    var buf, count;

    return function onmessage(event) {
      if (typeof event.data === 'string') {
        buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
        count = 0;
        console.log('Expecting a total of ' + buf.byteLength + ' bytes');
        return;
      }

      var data = new Uint8ClampedArray(event.data);
      buf.set(data, count);

      count += data.byteLength;
      console.log('count: ' + count);

      if (count === buf.byteLength) {
        // we're done: all data chunks have been received
        console.log('Done. Rendering.');
        renderColor(buf);
      }
    };
  }

  function renderColor(buf) {
    document.querySelector('body').style.backgroundColor = convertColorToString(buf);
  }

  function sendIceCandidate(candidate) {
    console.log('---sending ICE candidate ---');
    let obj = { type: 'candidate', ice: candidate };
    let message = JSON.stringify(obj);
    console.log('sending candidate=' + message);
    ws.send(message);
  }

  function makeOffer() {
    peerConnection = prepareNewConnection();
    peerConnection.createOffer()
      .then(function (sessionDescription) {
        console.log('createOffer() succsess in promise');
        return peerConnection.setLocalDescription(sessionDescription);
      }).then(function () {
        console.log('setLocalDescription() succsess in promise');

        // -- Trickle ICE の場合は、初期SDPを相手に送る -- 
        sendSdp(peerConnection.localDescription);
      }).catch(function (err) {
        console.error(err);
      });
  }

  function setOffer(sessionDescription) {
    if (peerConnection) {
      console.error('peerConnection alreay exist!');
    }
    peerConnection = prepareNewConnection();
    peerConnection.setRemoteDescription(sessionDescription)
      .then(function () {
        console.log('setRemoteDescription(offer) succsess in promise');
        makeAnswer();
      }).catch(function (err) {
        console.error('setRemoteDescription(offer) ERROR: ', err);
      });
  }

  function makeAnswer() {
    console.log('sending Answer. Creating remote session description...');
    if (!peerConnection) {
      console.error('peerConnection NOT exist!');
      return;
    }

    peerConnection.createAnswer()
      .then(function (sessionDescription) {
        console.log('createAnswer() succsess in promise');
        return peerConnection.setLocalDescription(sessionDescription);
      }).then(function () {
        console.log('setLocalDescription() succsess in promise');

        // -- Trickle ICE の場合は、初期SDPを相手に送る -- 
        sendSdp(peerConnection.localDescription);
      }).catch(function (err) {
        console.error(err);
      });
  }

  function setAnswer(sessionDescription) {
    if (!peerConnection) {
      console.error('peerConnection NOT exist!');
      return;
    }

    peerConnection.setRemoteDescription(sessionDescription)
      .then(function () {
        console.log('setRemoteDescription(answer) succsess in promise');
      }).catch(function (err) {
        console.error('setRemoteDescription(answer) ERROR: ', err);
      });
  }

  // start PeerConnection
  function connect() {
    if (!peerConnection) {
      console.log('make Offer');
      makeOffer();
    }
    else {
      console.warn('peer already exist.');
    }
  }

  // close PeerConnection
  function hangUp() {
    if (peerConnection) {
      console.log('Hang up.');
      peerConnection.close();
      peerConnection = null;
      pauseVideo(remoteVideo);
    }
    else {
      console.warn('peer NOT exist.');
    }
  }

  // send messeage
  function sendMessage() {
    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;
    var color = convertColorToUint8ClampedArray(document.querySelector('#color_for_message').value);
    len = 3,
      n = len / CHUNK_LEN | 0;

    console.log('Sending a total of ' + len + ' byte(s)');
    dataChannel.send(len);

    // split the photo and send in chunks of about 64KB
    for (var i = 0; i < n; i++) {
      var start = i * CHUNK_LEN,
        end = (i + 1) * CHUNK_LEN;
      console.log(start + ' - ' + (end - 1));
      dataChannel.send(color.subarray(start, end));
    }

    // send the reminder, if any
    if (len % CHUNK_LEN) {
      console.log('last ' + len % CHUNK_LEN + ' byte(s)');
      dataChannel.send(color.subarray(n * CHUNK_LEN));
    }
  }

  function convertColorToUint8ClampedArray(color) {
    var ret = new Uint8ClampedArray(3);
    for (var i = 0; i < ret.byteLength; i++) {
      ret[i] = parseInt(color.substr(i * 2 + 1, 2), 16);
    }
    return ret;
  }

  function convertColorToString(color) {
    return color.reduce((s, e) => s + ('0' + e.toString(16)).slice(-2), '#');
  }
  
  function addIceCandidate(candidate) {
    if (peerConnection) {
      peerConnection.addIceCandidate(candidate);
    }
    else {
      console.error('PeerConnection not exist!');
      return;
    }
  }

}, false);