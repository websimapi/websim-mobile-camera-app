const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const imgElement = document.getElementById('imgElement');

const startCameraBtn = document.getElementById('startCameraBtn');
const takePictureBtn = document.getElementById('takePictureBtn');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');

const downloadLinksContainer = document.getElementById('downloadLinks');
const imageOutputContainer = document.getElementById('imageOutput');
const videoOutputContainer = document.getElementById('videoOutput');


let stream = null;
let mediaRecorder = null;
let recordedChunks = [];

// --- Sound Effects ---
let audioContext;
const shutterSoundBuffer = null; // We'll load this later if needed
const recordStartSoundBuffer = null;
const recordStopSoundBuffer = null;

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

async function playSound(buffer) {
    if (!buffer || !audioContext) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

// Example: Load a sound (replace with actual sound loading if you add assets)
// async function loadSound(url) {
//     if (!getAudioContext()) return null;
//     try {
//         const response = await fetch(url);
//         const arrayBuffer = await response.arrayBuffer();
//         return await audioContext.decodeAudioData(arrayBuffer);
//     } catch (error) {
//         console.error(`Error loading sound: ${url}`, error);
//         return null;
//     }
// }

// async function initSounds() {
//     shutterSoundBuffer = await loadSound('path/to/shutter.mp3');
//     recordStartSoundBuffer = await loadSound('path/to/record_start.mp3');
//     recordStopSoundBuffer = await loadSound('path/to/record_stop.mp3');
// }
// initSounds(); // Call this if you add sound assets

// --- Camera Logic ---
startCameraBtn.addEventListener('click', async () => {
    try {
        if (stream) { // Stop existing stream if any
            stream.getTracks().forEach(track => track.stop());
        }
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment' // Prioritize rear camera
            },
            audio: true // Request audio for recording
        });
        videoElement.srcObject = stream;
        videoElement.style.display = 'block';

        startCameraBtn.textContent = 'Switch Camera'; // Or Stop Camera
        takePictureBtn.disabled = false;
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true; // Stop recording is disabled until recording starts

        // Reset UI elements
        imgElement.style.display = 'none';
        imgElement.src = '#';
        clearDownloadLinks();
        videoOutputContainer.innerHTML = '<p>Last Video Recorded:</p>';


    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access camera. Please ensure permissions are granted and try again. Error: " + err.message);
        takePictureBtn.disabled = true;
        startRecordBtn.disabled = true;
        stopRecordBtn.disabled = true;
    }
});

takePictureBtn.addEventListener('click', () => {
    if (!stream || !stream.active) {
        alert("Camera not active.");
        return;
    }
    // await playSound(shutterSoundBuffer); // Play shutter sound

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const context = canvasElement.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    const dataUrl = canvasElement.toDataURL('image/png');
    imgElement.src = dataUrl;
    imgElement.style.display = 'block';

    clearDownloadLinks('image');
    createDownloadLink(dataUrl, 'picture.png', 'image/png', 'image');
});

startRecordBtn.addEventListener('click', () => {
    if (!stream || !stream.active) {
        alert("Camera not active.");
        return;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        alert("Already recording.");
        return;
    }
    // await playSound(recordStartSoundBuffer);

    recordedChunks = [];
    const options = { mimeType: 'video/webm; codecs=vp9,opus' }; // Prioritize webm with vp9/opus for wide compatibility
    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e1) {
        console.warn("webm/vp9/opus not supported, trying vp8/opus", e1);
        try {
            const options2 = { mimeType: 'video/webm; codecs=vp8,opus' };
            mediaRecorder = new MediaRecorder(stream, options2);
        } catch (e2) {
            console.warn("webm/vp8/opus not supported, trying default", e2);
             try {
                mediaRecorder = new MediaRecorder(stream); // Browser default
            } catch (e3) {
                alert("MediaRecorder is not supported by your browser or with the current camera stream.");
                console.error("Error initializing MediaRecorder:", e3);
                return;
            }
        }
    }
    

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);

        // Display the recorded video
        videoOutputContainer.innerHTML = `
            <p>Last Video Recorded:</p>
            <video src="${videoUrl}" controls width="100%"></video>
        `;
        
        clearDownloadLinks('video');
        createDownloadLink(videoUrl, 'video.webm', blob.type, 'video');
        
        // Re-enable start recording and take picture, disable stop
        startRecordBtn.disabled = false;
        takePictureBtn.disabled = false;
        stopRecordBtn.disabled = true;
        startRecordBtn.textContent = 'Start Recording';
    };

    mediaRecorder.start();
    startRecordBtn.textContent = 'Recording...';
    startRecordBtn.disabled = true;
    takePictureBtn.disabled = true; // Disable taking picture while recording
    stopRecordBtn.disabled = false;
});

stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // await playSound(recordStopSoundBuffer);
        // UI updates are handled in mediaRecorder.onstop
    } else {
        // This case should ideally not be reachable if buttons are managed correctly
        stopRecordBtn.disabled = true;
        startRecordBtn.disabled = false;
        takePictureBtn.disabled = false;
    }
});

function createDownloadLink(href, filename, type, category) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.textContent = `Download ${category === 'image' ? 'Picture' : 'Video'} (${filename})`;
    link.target = '_blank'; // Good for data URLs on some browsers
    downloadLinksContainer.appendChild(link);
}

function clearDownloadLinks(category = null) {
    const links = downloadLinksContainer.querySelectorAll('a');
    links.forEach(link => {
        const isImageLink = link.download.includes('picture');
        const isVideoLink = link.download.includes('video');

        if (category === 'image' && isImageLink) {
            link.remove();
        } else if (category === 'video' && isVideoLink) {
            link.remove();
        } else if (!category) { // Clear all if no category specified
            link.remove();
        }
    });
}

// Initial state
function setInitialState() {
    takePictureBtn.disabled = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    imgElement.style.display = 'none';
    videoElement.style.display = 'none'; // Hide video element until stream starts
}

// Initialize
setInitialState();
// getAudioContext(); // Initialize AudioContext on user interaction if preferred, or here

