const unavailable = () => { throw new Error("File access is not available in the browser"); };
export const readFileSync = unavailable;
export const writeFileSync = unavailable;
export const mkdirSync = unavailable;
export const existsSync = () => false;
