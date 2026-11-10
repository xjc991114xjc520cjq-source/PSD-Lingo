// Auxiliary work never participates in the export/edit promise chain.
export function startLearningTask(action){return Promise.resolve().then(action).catch(()=>{});}
