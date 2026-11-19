const zlib = require('zlib');
const A = { d: 'eJyNlN9LwzAQx/8VyXOUu+bnDfYgsgdBRHCor7XrRplFaasoc/+7yVpBdhOuD83d5ZNw5PtNivqZHKENzykwwVRl5SrAlV+76FdgdmrZldX2pukHNduptlIz5YuggyV97tCb4EifaVBaDXkuje37OA71lL/lNeZoDXx7V7CS51TkFDEqIKPCcZepZDnlOBU4FRkVgVEROWU4ZTnlORU4RYwiYBQVx1SWov2YtGhP6ZeO9IQ8MsVkIsp0FUktVF9mCJlHZLaROUlkLqHfZBaUuVJmVJl3ZXYWOVxoesk9OF1iCxG819HjVLNGY7o42368QOtmHPuh7IZl06Y3DgNZi78bqD4TSOA1UgGaPOlDdgggHTNChDx3YSB4KqZ/ccDVXo8P7v2/+z/UXbP++jsF46fV591rbtNRbvClWdVjjhhToew2KV7AbXd51eP14fJ62sznav8D/vFWYw==',
  e: 'JRMmZQ8qAgVAeQIXVU9EBlICU3T+Pyh5eAwKZSOmMA0vVU2C+nZvXjoeeHNAJecR5XRscjOyEGqQ4uTkVcA9KkhBDFE/KUMLAmTndXI5ZEPqDCoNCChHaxNKNlIqeR48aCyoO89dEgcQan1OgIge3TaOi5xcuj0TLy6YUqzMbIAJeDV1IQVXfXh2bm9eUlAAOEhe5QZCLz0DETFPHhGNJE5inz0Ldyd4EFhwVxYiATwBcUszWNmEAx1utB4FWpc5RhxwZUR3ElhxPwznKGF7BGkYBD50eybSWx5EWw1YUC0zr3dpvzcjtQSf3XtBanKuKB4Oi0oWLCATCtIaH35ivETKECRJbxAqc3VOaVp4Mg87X2sqSEoYNTwEOXKjPxV2Drt66l4DrxMCH2GE9elTbxc4IdUOKrHGgUNaCni7BnRNc3MqFSKMDQlUoEhsbkkKVUo+KRoCdvB1akBEAMp8CatbbQVA4z1By/drLDFEMKk/WtZ8Hs9bYxbXqTSu0qxyEHgzFRgMBCFT+GwRcAs4A3wYOEc5UioEVfBrgGsHvFJLmxPdcnQ4msxQRQvgm9UfrbUsJLm72yN1B4JLFWcL46lbU0M4TxoeZCcxEb14QSE=' };
const B = { d: 'eJyNlE1PwzAMhv8KyjkgO83npF04gzRExYFb17WoGmGoLZ9j/510GdI0D8ntwYnzOIryvk6tsLIrA14VRjfKNBqXTV1j0aINy5XeirKv6vVNN4xithWxFjNhlZNOB3lp0DkHhbyQIKQYp7UU41uOY3OYv041xUkN/FijSMpSylMqEMohodzpKVNKU8pQylHKE8oDoTxSqqCUppSllKNUIFQAQgV1Sk1SxPeDFvGcfulKz8jDU4wnIk9XltRM9XmG4HmEZxuek1jmYvqNZ0GeK3lG5XmXZ2eWw5mm5/TB+RQpRLBWeos5Z5MSmBpnPeQGarsch7Hqx7KL6Y1DF7TGvw3EMBEYwEoMCmSwQe5n+wGka0bwINHjlcejf0+Lnczv7f2/2z80fdd+HS9B/qT4XGymU5owne+5WzV5juhTouqf0rh8jJvF9fhyW37Hu4/5XOx+AYC7VZI=',
  e: 'JRMmZQ9RGgFAeQILRRREM1Lwt2IkMHl5TGx9MC+7JhIJZECxO3ZoQQ8dBap3IhkqKX5qewGANxiwksXlmp920HIwKFd+BA1VNE4PHXsXd0syPS85VzxmR/BVdYluYjDXqx28OcpWK+NOfH8qXlcL/BiKbZQOvDgF5i+xeokShrcOiA1vFRhnaGB9fWdqsUYg4pQg/TxUB0U9bTQKyAGSBTFwbOB2mRJ43IV5TRUrbzVfmDFucN2fJhhitiMrjGQuOXp8CzxxQVlXQRoGXgUcBAYRDd8DSHw6ozU7sCgScikERURyjdgCmlSE4neABRuiIF8vjkoec0h1KztxfEBWWnXMFydJO3w3lxlMF1d9ZSc7KXU6Znd6X11yPimjZWF2VlxN6G5HRAgmEwH95BVWTsPm9gAKQ7Da9V5bzJrlYWddLHAkNT15NEpGUSh2ASEbU3o4HC1CCd9ZaHdL3DBOdblVeTNB+QRvEOdLEBgoDJUYJCYFLd88LQkQmNHb0vaSc3E59B0AAiAeAjk7YBgBGnBhWVFdYzVtNQwpjWcWWXVApyAERWMusMtPTjUjliIVsklvI0Cp329TVZm0VmFg4k9/VQZYYgcTPQMydw==' };

const d1 = Buffer.from(A.d, 'base64'), d2 = Buffer.from(B.d, 'base64');
const j1 = zlib.inflateSync(d1).toString('utf8'), j2 = zlib.inflateSync(d2).toString('utf8');
console.log('json1', j1.length, 'json2', j2.length);
const e1 = Buffer.from(A.e, 'base64').slice(3), e2 = Buffer.from(B.e, 'base64').slice(3);
console.log('enc1', e1.length, 'enc2', e2.length);

function firstDiff(a, b) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i; return -1; }
console.log('deflate 首差:', firstDiff(d1, d2), '/', Math.min(d1.length, d2.length));
console.log('enc 首差:', firstDiff(e1, e2), '/', Math.min(e1.length, e2.length));
console.log('json 首差:', (() => { const n = Math.min(j1.length, j2.length); for (let i = 0; i < n; i++) if (j1[i] !== j2[i]) return i; return -1; })());
// json 差异片段
let n = Math.min(j1.length, j2.length), fd = -1;
for (let i = 0; i < n; i++) if (j1[i] !== j2[i]) { fd = i; break; }
if (fd >= 0) {
  console.log('json 差异片段 j1:', JSON.stringify(j1.slice(Math.max(0, fd - 40), fd + 80)));
  console.log('json 差异片段 j2:', JSON.stringify(j2.slice(Math.max(0, fd - 40), fd + 80)));
}
console.log('nonce1', j1.slice(0, 32), 'nonce2', j2.slice(0, 32), 'same', j1.slice(0, 32) === j2.slice(0, 32));
