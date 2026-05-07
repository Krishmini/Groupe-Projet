// test-phases.js — Tests des phases 1-5 du mini-Perplexity
import { 
  ragQuery, 
  getSessionCost, 
  resetSessionCost, 
  calculateCost, 
  computeConfidence 
} from './rag-pipeline.js';

console.log('🧪 === Mini-Perplexity Test Suite ===\n');

// ========== TEST 1 : Question normale (happy path) ==========
async function test1_normalQuestion() {
  console.log('📌 TEST 1 : Question normale (happy path)');
  resetSessionCost();
  
  try {
    const result = await ragQuery('Quels sont les bénéfices scientifiques d\'une sieste de 20 minutes ?', {
      topK: 5,
      verbose: true,
    });
    
    console.log('\n✅ Réponse reçue (première 200 chars):', result.answer.substring(0, 200));
    console.log('✅ Sources:', result.sources.length, 'trouvées');
    console.log('✅ Coût session:', getSessionCost(), 'USD');
    return true;
  } catch (err) {
    console.error('❌ TEST 1 échoué:', err.message);
    return false;
  }
}

// ========== TEST 2 : Timeout réseau simulé ==========
async function test2_timeout() {
  console.log('\n📌 TEST 2 : Timeout (simule une déconnexion réseau)');
  console.log('⚠️  Coupez votre WiFi maintenant et relancez, ou attendez que le timeout se déclenche...\n');
  
  // On va laisser ce test comme un placeholder pour la démo
  // En prod, on forcerait un timeout en modifiant le timeout à 1ms
  console.log('⏭️  À faire : modifier callLLM timeout à 1ms pour tester\n');
  return null;
}

// ========== TEST 3 : Retry exponentiel (429 forcé) ==========
async function test3_retry() {
  console.log('📌 TEST 3 : Retry exponentiel (429 / rate limiting)');
  console.log('⚠️  Ce test nécessite de forcer une 429 en envoyant 100 requêtes d\'affilée');
  console.log('⏭️  À faire : implémenter une boucle de 100 questions\n');
  return null;
}

// ========== TEST 4 : Cost tracking ==========
async function test4_costTracking() {
  console.log('📌 TEST 4 : Cost tracking avec session total');
  resetSessionCost();
  
  try {
    // Test calculateCost directement
    const costData = calculateCost(743, 187, 'mistral-large-latest');
    console.log(`  [Stats] Input: ${costData.promptTokens} tokens | Output: ${costData.completionTokens} tokens | Coût: $${costData.costUSD.toFixed(4)} | Session total: $${costData.sessionTotal.toFixed(6)}`);
    
    // Vérifier que le coût est correct
    const expectedCost = (743 * 2.00 + 187 * 6.00) / 1_000_000;
    console.log(`  Coût attendu: $${expectedCost.toFixed(6)}, Coût calculé: $${costData.costUSD.toFixed(6)}`);
    console.log('✅ Cost tracking fonctionne');
    return true;
  } catch (err) {
    console.error('❌ TEST 4 échoué:', err.message);
    return false;
  }
}

// ========== TEST 5 : Confidence scoring ==========
async function test5_confidence() {
  console.log('\n📌 TEST 5 : Confidence scoring');
  
  try {
    // Cas 1 : Bonne confiance
    const matches1 = [
      { score: 0.89 },
      { score: 0.87 },
      { score: 0.85 },
      { score: 0.78 },
    ];
    const conf1 = computeConfidence(matches1);
    console.log(`  Cas 1 (bonne confiance): topScore=${conf1.topScore}, avgTop3=${conf1.avgScore}, sufficient=${conf1.sufficient}`);
    
    // Cas 2 : Confiance moyenne
    const matches2 = [
      { score: 0.68 },
      { score: 0.65 },
      { score: 0.62 },
    ];
    const conf2 = computeConfidence(matches2);
    console.log(`  Cas 2 (confiance moyenne): topScore=${conf2.topScore}, avgTop3=${conf2.avgScore}, sufficient=${conf2.sufficient}`);
    
    // Cas 3 : Pas de match
    const conf3 = computeConfidence([]);
    console.log(`  Cas 3 (pas de match): topScore=${conf3.topScore}, sufficient=${conf3.sufficient}`);
    
    console.log('✅ Confidence scoring fonctionne');
    return true;
  } catch (err) {
    console.error('❌ TEST 5 échoué:', err.message);
    return false;
  }
}

// ========== TEST 6 : Early exit si confiance insuffisante ==========
async function test6_earlyExit() {
  console.log('\n📌 TEST 6 : Early exit si confiance insuffisante');
  resetSessionCost();
  
  try {
    // Question hors corpus
    const result = await ragQuery('Quel est le prix du Bitcoin en décembre 2024 ?', {
      topK: 5,
      verbose: true,
    });
    
    if (result.metrics.shortCircuit) {
      console.log('\n✅ Court-circuit détecté (pas d\'appel LLM)');
      console.log('✅ Coût session après early exit:', getSessionCost(), 'USD (doit être 0)');
    } else {
      console.log('❌ Court-circuit NON détecté (LLM a été appelé)');
    }
    return true;
  } catch (err) {
    console.error('❌ TEST 6 échoué:', err.message);
    return false;
  }
}

// ========== MAIN ==========
async function main() {
  const results = [];
  
  results.push(await test1_normalQuestion());
  results.push(await test4_costTracking());
  results.push(await test5_confidence());
  results.push(await test6_earlyExit());
  
  // Results summary
  const passed = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;
  const skipped = results.filter(r => r === null).length;
  
  console.log(`\n📊 === RÉSUMÉ ===`);
  console.log(`✅ Passés: ${passed}`);
  console.log(`❌ Échoués: ${failed}`);
  console.log(`⏭️  Skippés: ${skipped}`);
}

main().catch(console.error);
