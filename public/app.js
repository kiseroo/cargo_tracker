// DOM Elements
const elements = {
    video: document.getElementById('qr-video'),
    startScan: document.getElementById('startScan'),
    stopScan: document.getElementById('stopScan'),
    uploadQR: document.getElementById('uploadQR'),
    qrInput: document.getElementById('qrInput'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    itemsTableBody: document.getElementById('itemsTableBody'),
    exportWord: document.getElementById('exportWord'),
    exportDB: document.getElementById('exportDB'),
    loginBtn: document.getElementById('loginBtn'),
    registerBtn: document.getElementById('registerBtn'),
    authModal: document.getElementById('authModal'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    // Add form inputs
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    registerConfirmPassword: document.getElementById('registerConfirmPassword'),
    closeModal: document.querySelector('.close'),
    registerSubmitBtn: document.querySelector('#registerForm .submit-btn'),
    loginSubmitBtn: document.querySelector('#loginForm .submit-btn')
};

// State Management
let state = {
    isScanning: false,
    isAuthenticated: false,
    codeReader: new ZXing.BrowserQRCodeReader(),
    scannedItems: [],
    user: null
};

// Event Listeners
elements.startScan.addEventListener('click', startScanning);
elements.stopScan.addEventListener('click', stopScanning);
elements.uploadQR.addEventListener('click', () => elements.qrInput.click());
elements.qrInput.addEventListener('change', handleQRUpload);
elements.searchInput.addEventListener('input', handleSearch);
elements.searchBtn.addEventListener('click', handleSearch);
elements.exportWord.addEventListener('click', exportToWord);
elements.exportDB.addEventListener('click', saveToDatabase);
elements.loginBtn.addEventListener('click', () => showAuthModal('login'));
elements.registerBtn.addEventListener('click', () => showAuthModal('register'));
elements.closeModal.addEventListener('click', hideAuthModal);

// Remove the duplicate event listeners and simplify the form submission
elements.loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    handleLogin();
});

elements.registerForm.addEventListener('submit', function(e) {
    e.preventDefault();
    handleRegister();
});

// Remove button click handlers since we're handling form submit
elements.registerSubmitBtn.addEventListener('click', function(e) {
    e.preventDefault();
    handleRegister();
});

elements.loginSubmitBtn.addEventListener('click', function(e) {
    e.preventDefault();
    handleLogin();
});

// QR Code Scanning Functions
async function startScanning() {
    try {
        // Stop any existing scanner session first
        if (state.isScanning) {
            stopScanning();
            // Add a small delay to ensure resources are released
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Basic video setup
        const videoElement = elements.video;
        videoElement.setAttribute('playsinline', true);
        videoElement.setAttribute('autoplay', true);
        videoElement.setAttribute('muted', true);
        videoElement.muted = true;
        
        // Set basic constraints
        const constraints = { 
            video: { 
                facingMode: 'environment'
            },
            audio: false
        };
        
        console.log('Requesting camera with constraints:', constraints);
        
        // Get camera stream
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Camera access granted successfully');
        } catch (cameraError) {
            console.error('Camera access error:', cameraError);
            // Try with simpler constraints as fallback
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        
        // Set the stream to the video element
        videoElement.srcObject = stream;
        
        // Play the video
        try {
            await videoElement.play();
            console.log('Video playing successfully');
        } catch (playError) {
            console.error('Error playing video:', playError);
            showNotification('Error starting camera: ' + playError.message, 'error');
            throw playError;
        }

        // Update UI state
        state.isScanning = true;
        elements.startScan.disabled = true;
        elements.stopScan.disabled = false;

        console.log('Starting QR code scanning...');
        // Start continuous scanning with enhanced error handling
        state.codeReader.decodeFromVideoDevice(null, 'qr-video', (result, err) => {
            if (result) {
                console.log('QR code detected:', result.text);
                handleScannedData(result.text);
                // Don't stop scanning after successful scan - continue for multiple scans
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('Scanning error:', err);
            }
        }).catch(scanErr => {
            console.error('Error starting scanner:', scanErr);
            showNotification('Error starting scanner: ' + scanErr.message, 'error');
            // Reset UI state on error
            state.isScanning = false;
            elements.startScan.disabled = false;
            elements.stopScan.disabled = true;
        });

        showNotification('Scanner started successfully');
    } catch (error) {
        console.error('Error accessing camera:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('Camera access was denied. Please grant permission in your browser settings.', 'error');
        } else if (error.name === 'NotFoundError') {
            showNotification('No camera found on your device.', 'error');
        } else if (error.name === 'NotReadableError') {
            showNotification('Camera is in use by another application.', 'error');
        } else {
            showNotification('Error accessing camera: ' + error.message, 'error');
        }
        
        // Reset UI state on error
        state.isScanning = false;
        elements.startScan.disabled = false;
        elements.stopScan.disabled = true;
    }
}

function stopScanning() {
    if (state.isScanning) {
        console.log('Stopping scanner and releasing camera resources...');
        try {
            // First reset the code reader
            state.codeReader.reset();
            
            // Then properly stop all tracks from the video stream
            if (elements.video.srcObject) {
                const tracks = elements.video.srcObject.getTracks();
                console.log(`Stopping ${tracks.length} media tracks`);
                tracks.forEach(track => {
                    track.stop();
                    console.log(`Track ${track.id} stopped`);
                });
                
                // Clear the srcObject
                elements.video.srcObject = null;
            }
            
            // Update UI state
            state.isScanning = false;
            elements.startScan.disabled = false;
            elements.stopScan.disabled = true;
            showNotification('Scanner stopped');
        } catch (error) {
            console.error('Error stopping scanner:', error);
            // Still update UI state even if there was an error
            state.isScanning = false;
            elements.startScan.disabled = false;
            elements.stopScan.disabled = true;
        }
    }
}

async function handleQRUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        // Show loading notification
        showNotification('Processing QR code...', 'info');

        // Create an image element
        const img = new Image();
        img.src = URL.createObjectURL(file);

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        // Create canvas and get context
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Try to decode QR code
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            console.log('QR Code detected:', code.data);
            handleScannedData(code.data);
        } else {
            showNotification('No QR code found in image', 'error');
        }

        // Clean up
        URL.revokeObjectURL(img.src);
    } catch (error) {
        console.error('Error processing QR code:', error);
        showNotification('Error processing QR code image', 'error');
    }
}

// Data Management Functions
function handleScannedData(data) {
    try {
        console.log('Attempting to parse QR data:', data);
        const parsedData = JSON.parse(data);
        
        // Validate required fields
        if (!parsedData.description && !parsedData.id) {
            throw new Error('Invalid QR code format: Missing required fields');
        }

        const item = {
            id: parsedData.id || generateId(),
            description: parsedData.description || 'No description',
            status: parsedData.status || 'Scanned',
            dateScanned: new Date().toISOString(),
            ...parsedData
        };

        console.log('Processed item:', item);
        state.scannedItems.unshift(item);
        updateItemsTable();
        showNotification('Item scanned successfully: ' + item.description, 'success');
        
        // Save to localStorage
        localStorage.setItem('scannedItems', JSON.stringify(state.scannedItems));
    } catch (error) {
        console.error('Error parsing QR data:', error, 'Raw data:', data);
        showNotification('Invalid QR code format. Please use the QR Generator to create valid codes.', 'error');
    }
}

function updateItemsTable() {
    elements.itemsTableBody.innerHTML = '';
    state.scannedItems.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.id}</td>
            <td>${item.description}</td>
            <td>${item.status}</td>
            <td>${new Date(item.dateScanned).toLocaleString()}</td>
            <td>
                <button onclick="editItem('${item.id}')" class="action-btn">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteItem('${item.id}')" class="action-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        elements.itemsTableBody.appendChild(row);
    });
}

function handleSearch() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const filteredItems = state.scannedItems.filter(item => 
        item.id.toLowerCase().includes(searchTerm) ||
        item.description.toLowerCase().includes(searchTerm) ||
        item.status.toLowerCase().includes(searchTerm)
    );
    
    updateItemsTable(filteredItems);
}

// Export Functions
async function exportToWord() {
    if (!state.scannedItems.length) {
        showNotification('No items to export', 'error');
        return;
    }

    try {
        showNotification('Generating document...', 'info');
        
        // Create document content
        const doc = new docx.Document({
            sections: [{
                children: [
                    new docx.Paragraph({
                        children: [
                            new docx.TextRun({
                                text: "Cargo Items Report",
                                size: 32,
                                bold: true
                            })
                        ],
                        spacing: { after: 300 }
                    }),
                    ...state.scannedItems.map(item => [
                        new docx.Paragraph({
                            children: [
                                new docx.TextRun({
                                    text: `Item ID: ${item.id}`,
                                    size: 24,
                                    bold: true
                                })
                            ],
                            spacing: { before: 200 }
                        }),
                        new docx.Paragraph({
                            children: [new docx.TextRun(`Description: ${item.description}`)]
                        }),
                        new docx.Paragraph({
                            children: [new docx.TextRun(`Status: ${item.status}`)]
                        }),
                        new docx.Paragraph({
                            children: [new docx.TextRun(`Date Scanned: ${new Date(item.dateScanned).toLocaleString()}`)]
                        }),
                        ...(item.weight ? [new docx.Paragraph({
                            children: [new docx.TextRun(`Weight: ${item.weight}`)]
                        })] : []),
                        ...(item.destination ? [new docx.Paragraph({
                            children: [new docx.TextRun(`Destination: ${item.destination}`)]
                        })] : []),
                        ...(item.sender ? [new docx.Paragraph({
                            children: [new docx.TextRun(`Sender: ${item.sender}`)]
                        })] : []),
                        new docx.Paragraph({
                            children: [new docx.TextRun("──────────────────────────")],
                            spacing: { after: 200 }
                        })
                    ]).flat()
                ]
            }]
        });

        // Generate blob
        docx.Packer.toBlob(doc).then(blob => {
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `cargo-report-${new Date().toISOString().split('T')[0]}.docx`;
            
            // Append link, trigger download, and cleanup
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
            
            showNotification('Document downloaded successfully', 'success');
        }).catch(error => {
            console.error('Error generating blob:', error);
            showNotification('Error generating document', 'error');
        });
        
    } catch (error) {
        console.error('Error creating document:', error);
        showNotification('Error creating document', 'error');
    }
}

// Authentication Functions
async function handleLogin() {
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;

    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    const loginBtn = elements.loginSubmitBtn;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
        console.log('Attempting login with:', { email });
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        console.log('Login response status:', response.status);
        const data = await response.json();
        console.log('Login response data:', data);

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store token and update state
        localStorage.setItem('authToken', data.token);
        state.isAuthenticated = true;
        state.user = { email };

        // Update UI
        hideAuthModal();
        showSuccessMessage('Login successful! Welcome back');
        updateAuthUI();

        // Clear form fields
        elements.loginForm.reset();
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
}

async function handleRegister() {
    const email = elements.registerEmail.value.trim();
    const password = elements.registerPassword.value;
    const confirmPassword = elements.registerConfirmPassword.value;

    if (!email || !password || !confirmPassword) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }

    const registerBtn = elements.registerSubmitBtn;
    registerBtn.disabled = true;
    registerBtn.textContent = 'Registering...';

    try {
        console.log('Attempting registration with:', { email });
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        console.log('Registration response status:', response.status);
        const data = await response.json();
        console.log('Registration response data:', data);

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        // Store token and update state
        localStorage.setItem('authToken', data.token);
        state.isAuthenticated = true;
        state.user = { email };

        // Update UI
        hideAuthModal();
        showSuccessMessage('Account created successfully! Welcome to Cargo Tracker');
        updateAuthUI();

        // Clear form fields
        elements.registerForm.reset();
    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message || 'Registration failed', 'error');
    } finally {
        registerBtn.disabled = false;
        registerBtn.textContent = 'Register';
    }
}

function showAuthModal(type) {
    elements.authModal.style.display = 'block';
    elements.loginForm.style.display = type === 'login' ? 'block' : 'none';
    elements.registerForm.style.display = type === 'register' ? 'block' : 'none';
}

function hideAuthModal() {
    elements.authModal.style.display = 'none';
    // Clear any form errors
    elements.loginForm.reset();
    elements.registerForm.reset();
}

function updateAuthUI() {
    const loginBtn = elements.loginBtn;
    const registerBtn = elements.registerBtn;
    
    if (state.isAuthenticated) {
        loginBtn.textContent = 'Logout';
        registerBtn.style.display = 'none';
        loginBtn.removeEventListener('click', () => showAuthModal('login'));
        loginBtn.addEventListener('click', handleLogout);
    } else {
        loginBtn.textContent = 'Login';
        registerBtn.style.display = 'inline-block';
        loginBtn.removeEventListener('click', handleLogout);
        loginBtn.addEventListener('click', () => showAuthModal('login'));
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    state.isAuthenticated = false;
    state.user = null;
    updateAuthUI();
    showNotification('Logged out successfully');
}

// Update the existing saveToDatabase function to include the auth token
async function saveToDatabase() {
    if (!state.isAuthenticated) {
        showNotification('Please login to save data', 'error');
        showAuthModal('login');
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(state.scannedItems)
        });

        if (!response.ok) throw new Error('Failed to save data');
        showNotification('Data saved to database successfully');
    } catch (error) {
        console.error('Error saving to database:', error);
        if (error.message.includes('401') || error.message.includes('403')) {
            showNotification('Please login again', 'error');
            showAuthModal('login');
        } else {
            showNotification('Error saving to database', 'error');
        }
    }
}

// Update the existing checkAuthStatus function
async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            // Verify token by making a request to get items
            const response = await fetch('/api/items', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                state.isAuthenticated = true;
                updateAuthUI();
            } else {
                throw new Error('Invalid token');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('authToken');
            state.isAuthenticated = false;
            updateAuthUI();
        }
    }
}

// Utility Functions
function generateId() {
    return `CARGO-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

function showNotification(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    // Clear any existing timeout
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }
    
    // Set new timeout
    toast.timeoutId = setTimeout(() => {
        toast.className = 'toast';
    }, duration);
}

function showSuccessMessage(message) {
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'welcome-message';
    welcomeMessage.textContent = message;
    document.body.appendChild(welcomeMessage);

    // Show the welcome message with animation
    setTimeout(() => welcomeMessage.classList.add('show'), 100);

    // Remove the welcome message after animation
    setTimeout(() => {
        welcomeMessage.classList.remove('show');
        setTimeout(() => welcomeMessage.remove(), 500);
    }, 3000);

    // Also show in toast
    showNotification(message, 'success', 5000);
}

// Initialize the application
function init() {
    // Check authentication status
    checkAuthStatus();
    
    // Load any saved items from localStorage
    loadSavedItems();
    
    // Update UI
    updateItemsTable();
}

function loadSavedItems() {
    const savedItems = localStorage.getItem('scannedItems');
    if (savedItems) {
        state.scannedItems = JSON.parse(savedItems);
    }
}

// Start the application
init();