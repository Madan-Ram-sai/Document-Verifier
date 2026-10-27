// Plug your teammate's OCR service in via OCR_URL. Without it, a mock is used for testing.
// Expected OCR reply:
//   marksheets: { name, dob, board, year, obt, max, subjects:[{name,obt,max}], conf }
//   aadhaar   : { name, dob, doc_number, conf }
//   category  : { name, father_name, cert_type, conf }
const URL_ = process.env.OCR_URL;

export async function extract(buf, docName, record) {
  if (!URL_) return mock(record, docName);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), 'doc.pdf');
  fd.append('doc', docName);
  const r = await fetch(URL_, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('ocr ' + r.status);
  return r.json();
}

// Supplies representative OCR data until OCR_URL is configured.
function mock(record, docName = '') {
  if (!/10th|12th/i.test(docName)) {
    return { name: record.kv["candidate's name"], father_name: record.kv["father's name"],
      dob: record.kv['date of birth'], doc_number: 'XXXX XXXX 1234', cert_type: /category/i.test(docName) ? 'EWS' : undefined,
      conf: 0.95 };
  }
  const is12 = /12th/i.test(docName);
  const m = record.acad.find(r => new RegExp(is12 ? '12th' : '10th', 'i').test(r.qualification || '')) || {};
  const k = h => m[Object.keys(m).find(x => x.includes(h))];
  const n = v => parseFloat(String(v).replace(/[^\d.]/g, ''));
  const nm = is12 ? ['Physics', 'Chemistry', 'Mathematics', 'English', 'Gujarati'] : ['Mathematics', 'Science', 'English', 'Gujarati', 'Social Science', 'Hindi'];
  const mk = is12 ? [98, 97, 96, 95, 96] : [85, 80, 79, 75, 78, 77];
  return {
    name: record.kv["candidate's name"], dob: record.kv['date of birth'],
    board: k('board'), year: k('year'), obt: n(k('obtained')), max: n(k('maximum')),
    conf: 0.95,
    subjects: mk.map((o, i) => ({ name: nm[i], obt: o, max: is12 ? 130 : 100 })),
  };
}
