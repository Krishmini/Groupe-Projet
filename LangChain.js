import { MistralAIEmbeddings } from '@langchain/mistralai';
import { PineconeStore } from '@langchain/pinecone';
import { ChatMistralAI } from '@langchain/mistralai';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
const embeddings = new MistralAIEmbeddings({ model: 'mistral-embed' });
const vectorStore = await PineconeStore.fromExistingIndex(embeddings, { pineconeIndex: 
index });
const retriever = vectorStore.asRetriever({ k: 5 });
const llm = new ChatMistralAI({ model: 'mistral-small-latest', temperature: 0.1 });
const prompt = ChatPromptTemplate.fromTemplate(`
Contexte : {context}
Question : {input}
Réponds uniquement à partir du contexte. Cite tes sources.
`);
const chain = await createRetrievalChain({
combineDocsChain: await createStuffDocumentsChain({ llm, prompt }),
retriever
});
const result = await chain.invoke({ input: question });
console.log(result.answer);

//