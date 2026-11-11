import { generateTimetables } from './scheduler.js';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,result:generateTimetables(data.assignments, data.config, data.count || 3)}); }
  catch (error) { self.postMessage({id:data.id,error:error.message}); }
};
