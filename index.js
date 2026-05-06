import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

// Paramètres
const CHUNK_SIZE = 400;
const OVERLAP = 50;
const BATCH_SIZE = 50; 
const EMBED_CONCURRENCY = 5;

// --- Fonctions utilitaires ---

function chunkWithOverlap(text, size, overlap) {
    const words = text.split(/\s+/);
    const chunks = [];
    let i = 0;
    while (i < words.length) {
        chunks.push(words.slice(i, i + size).join(' '));
        i += size - overlap;
    }
    return chunks.filter(c => c.trim().length > 0);
}

async function embedBatch(texts) {
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
            model: "mistral-embed",
            input: texts
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Mistral API Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    // Mistral retourne un tableau d'objets contenant "embedding"
    return data.data.map(item => item.embedding);
}

// --- Traitement d'un fichier ---

async function processFile(filePath, indexName) {
    const index = pinecone.index(indexName);
    const text = readFileSync(filePath, 'utf-8');
    const filename = filePath.split('/').pop() || 'unknown';

    console.log(`\n→ Traitement de ${filename}...`);

    const rawChunks = chunkWithOverlap(text, CHUNK_SIZE, OVERLAP);
    console.log(`  ${rawChunks.length} chunks créés`);

    const vectors = [];

    // Embedding par lots concurrents
    for (let i = 0; i < rawChunks.length; i += EMBED_CONCURRENCY) {
        const batchTexts = rawChunks.slice(i, i + EMBED_CONCURRENCY);
        
        try {
            const embeddings = await embedBatch(batchTexts);
            
            embeddings.forEach((embedding, idx) => {
                const chunkIdx = i + idx;
                vectors.push({
                    id: `${filename}-chunk-${chunkIdx}`,
                    values: embedding,
                    metadata: {
                        text: batchTexts[idx],
                        source: filename,
                        chunkIndex: chunkIdx
                    }
                });
            });
        } catch (err) {
            console.error(`  Erreur lors de l'embedding du batch ${i}:`, err.message);
        }
    }

    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
        const batch = vectors.slice(i, i + BATCH_SIZE);
        await index.upsert(batch);
        console.log(`  Upsert ${Math.min(i + BATCH_SIZE, vectors.length)}/${vectors.length} vecteurs...`);
    }

    console.log(`  ✓ ${vectors.length} vecteurs indexés`);
    return vectors.length;
}

// --- Point d'entrée ---

async function main() {
    const INDEX_NAME = process.env.PINECONE_INDEX_NAME;
    const CORPUS_DIR = './corpus';

    if (!MISTRAL_API_KEY || !process.env.PINECONE_API_KEY) {
        throw new Error("Clés API manquantes dans le fichier .env");
    }

    const files = readdirSync(CORPUS_DIR)
        .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
        .map(f => join(CORPUS_DIR, f));

    console.log(`Indexation de ${files.length} fichiers dans l'index "${INDEX_NAME}"`);

    let total = 0;
    for (const file of files) {
        try {
            const count = await processFile(file, INDEX_NAME);
            total += count;
        } catch (error) {
            console.error(`  [ERREUR] Impossible de traiter ${file}:`, error.message);
        }
    }

    console.log(`\nIndexation terminée. ${total} vecteurs au total.`);
}

main().catch(console.error);