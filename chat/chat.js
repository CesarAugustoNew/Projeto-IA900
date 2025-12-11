// ------------------- VARIÁVEIS DE CONFIGURAÇÃO DO AZURE AI VISION (OCR) -------------------

// 🔒 Usando variáveis de ambiente para segurança
const visionEndpoint = window.ENV?.AZURE_VISION_ENDPOINT || "";
const visionKey = window.ENV?.AZURE_VISION_KEY || "";

// Elementos da Página
const fileInput = document.getElementById("imagem");
const divMensagens = document.getElementById("div_mensagens");
const divResultadosOCR = document.getElementById("div_resultados_ocr");
const textoOCRArea = document.getElementById("texto_ocr");

// ------------------- FUNÇÕES AUXILIARES DE UI -------------------
function addLog(message, type = 'info') {
    const now = new Date().toLocaleTimeString();
    divMensagens.innerHTML += `<div class="message ${type}">[${now}] ${message}</div>`;
    divMensagens.scrollTop = divMensagens.scrollHeight;
}

function clearResults() {
    divMensagens.innerHTML = '';
    divResultadosOCR.innerHTML = '';
    textoOCRArea.value = '';
    divResultadosOCR.style.display = "none";
    addLog("Pronto para um novo processamento.", 'info');
}

// ------------------- FUNÇÃO PARA DESENHAR DELIMITAÇÕES DO OCR -------------------
function drawBoundingBoxes(imageFile, ocrData) {
    divResultadosOCR.innerHTML = "";
    divResultadosOCR.style.display = "block";

    const title = document.createElement("h3");
    title.textContent = "Resultado Visual (Linhas Delimitadas):";
    divResultadosOCR.appendChild(title);

    const imageContainer = document.createElement("div");
    imageContainer.id = "image_container";
    
    const img = document.createElement("img");
    const reader = new FileReader();
    reader.onload = function (e) {
        img.src = e.target.result;
        imageContainer.appendChild(img);
        divResultadosOCR.appendChild(imageContainer);

        img.onload = () => {
            const scaleFactorX = img.clientWidth / img.naturalWidth;
            const scaleFactorY = img.clientHeight / img.naturalHeight;

            const results = ocrData.analyzeResult?.readResults || ocrData.recognitionResults || [];

            results.forEach((page) => {
                page.lines.forEach((line) => {
                    const box = line.boundingBox;
                    const x = box[0];
                    const y = box[1];
                    const w = box[4] - box[0];
                    const h = box[5] - box[1];

                    const rect = document.createElement("div");
                    rect.className = "bounding-box-ocr";
                    rect.style.left = `${x * scaleFactorX}px`;
                    rect.style.top = `${y * scaleFactorY}px`;
                    rect.style.width = `${w * scaleFactorX}px`;
                    rect.style.height = `${h * scaleFactorY}px`;
                    imageContainer.appendChild(rect);
                });
            });
        };
    };
    reader.readAsDataURL(imageFile);
}

// ------------------- FUNÇÃO PRINCIPAL DE OCR -------------------
async function executeOCR() {
    clearResults();
    const file = fileInput.files[0];

    if (!file) {
        addLog("🚫 Por favor, selecione um arquivo de imagem ou PDF primeiro.", 'error');
        return;
    }

    if (!visionEndpoint || !visionKey) {
        addLog("🚫 ERRO: O endpoint ou a chave do Azure não estão configurados.", "error");
        return;
    }

    const url = `${visionEndpoint}vision/v3.2/read/analyze`;
    let operationLocation = null;

    try {
        addLog(`Iniciando OCR para o arquivo: ${file.name}...`, 'info');

        const arrayBuffer = await file.arrayBuffer();
        addLog("1/4: Enviando imagem para o Azure (POST /read/analyze)...", 'info');

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": visionKey,
                "Content-Type": "application/octet-stream",
            },
            body: arrayBuffer,
        });

        if (response.status !== 202) {
            const errorBody = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`Erro ${response.status}: ${errorBody.message}`);
        }

        operationLocation = response.headers.get("operation-location");
        addLog(`2/4: Imagem enviada. Polling URL: ${operationLocation}`, 'info');

        let data = null;
        const maxAttempts = 15;
        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;
            await new Promise((r) => setTimeout(r, 3000));
            addLog(`3/4: Tentativa ${attempts}/${maxAttempts}: Verificando status...`, 'info');

            const resultResponse = await fetch(operationLocation, {
                headers: { "Ocp-Apim-Subscription-Key": visionKey },
            });
            data = await resultResponse.json();

            if (data.status === "succeeded") {
                addLog("4/4: OCR concluído com sucesso! ✅", 'success');
                break;
            }
            if (data.status === "failed") {
                throw new Error("Processamento OCR falhou.");
            }
            if (attempts === maxAttempts) {
                throw new Error("Tempo máximo de espera excedido.");
            }
        }

        const results = data.analyzeResult?.readResults || data.recognitionResults;
        textoOCRArea.value = results
            ? results.map((page) => page.lines.map((line) => line.text).join(" ")).join("\n")
            : "Não foi possível ler o texto.";

        drawBoundingBoxes(file, data);

    } catch (error) {
        console.error("❌ Erro OCR:", error);
        addLog(`Erro ao processar OCR: ${error.message}`, 'error');
        divResultadosOCR.style.display = "none";
    }
}

// ------------------- EVENT LISTENERS -------------------
document.getElementById("btnOCR").addEventListener("click", executeOCR);

// Inicializa a tela com a limpeza
clearResults();
