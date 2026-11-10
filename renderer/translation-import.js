import {workbookDialog} from './workbook-dialog.js';
export async function importTranslation(call,options={}){
 const initial=await call('importDocument',options);if(!initial?.selectionRequired)return initial;
 return workbookDialog(initial,selection=>call('importDocument',{path:initial.path,fingerprint:initial.fingerprint,selection,splitMode:'line'}));
}
