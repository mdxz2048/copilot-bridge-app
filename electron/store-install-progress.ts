/** Evidence of nonzero downloaded bytes / total, or percent; total size alone is not progress. */
export function storeDownloadProgress(text:string):number|null {
  const values:number[]=[];
  const unit=(value:string)=>1024**({B:0,KB:1,MB:2,GB:3,TB:4}[value.toUpperCase()]??0);
  for(const line of text.split(/[\r\n]/)) {
    // Store source initialization progress is unrelated to the package download.
    if(/source|源初始化|更新源/i.test(line))continue;
    for(const match of line.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {const n=Number(match[1]);if(n>0&&n<=100)values.push(n/100);}
    for(const match of line.matchAll(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\s*(?:\/|of)\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/gi)) {
      const downloaded=Number(match[1])*unit(match[2]),total=Number(match[3])*unit(match[4]);
      if(downloaded>0&&total>=downloaded)values.push(downloaded/total);
    }
  }
  return values.length?Math.max(...values):null;
}
