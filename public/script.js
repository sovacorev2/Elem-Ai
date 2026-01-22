document.addEventListener('DOMContentLoaded', () => {
    const studyForm = document.getElementById('studyForm');
    const studyMaterialInput = document.getElementById('studyMaterial');
    const userQueryInput = document.getElementById('userQuery');
    const aiTextResponse = document.getElementById('aiTextResponse');
    const aiAudioResponse = document.getElementById('aiAudioResponse');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorArea = document.getElementById('errorArea');
    const errorMessage = document.getElementById('errorMessage');

    studyForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const file = studyMaterialInput.files[0];
        const userQuery = userQueryInput.value.trim();

        if (!file) {
            showError('Please select a study material file.');
            return;
        }
        if (!userQuery) {
            showError('Please enter your query for Elem AI.');
            return;
        }

        const formData = new FormData();
        formData.append('studyMaterial', file);
        formData.append('userQuery', userQuery);

        aiTextResponse.textContent = 'Your AI-powered insights will appear here...';
        aiAudioResponse.removeAttribute('src');
        aiAudioResponse.load(); // Reset audio
        hideError();
        showLoading();

        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get response from Elem AI.');
            }

            const data = await response.json();
            aiTextResponse.textContent = data.aiResponse;
            
            if (data.audio) {
                // Create a data URL for the audio
                const audioBlob = b64toBlob(data.audio, 'audio/mp3');
                const audioUrl = URL.createObjectURL(audioBlob);
                aiAudioResponse.src = audioUrl;
                aiAudioResponse.play();
            } else {
                aiAudioResponse.removeAttribute('src');
            }

        } catch (error) {
            console.error('Fetch error:', error);
            showError(error.message);
        } finally {
            hideLoading();
        }
    });

    function showLoading() {
        loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorArea.style.display = 'block';
    }

    function hideError() {
        errorArea.style.display = 'none';
        errorMessage.textContent = '';
    }

    // Helper function to convert base64 to Blob
    function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
        const byteCharacters = atob(b64Data);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);

            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        const blob = new Blob(byteArrays, { type: contentType });
        return blob;
    }
});
