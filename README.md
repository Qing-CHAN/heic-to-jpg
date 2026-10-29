# HEIC to JPG Converter

一个纯前端的 HEIC → JPG 在线转换工具。所有转换在用户浏览器本地完成（WebAssembly），
文件不上传服务器，因此可以完全免费托管，没有带宽和隐私合规负担。

## 文件结构

```
heic-to-jpg/
├── index.html    # 主页（含 SEO 标签、JSON-LD 结构化数据）
├── style.css     # 样式
├── app.js        # 转换逻辑（heic2any + JSZip 批量打包）
├── favicon.svg   # 图标
├── robots.txt    # 搜索引擎抓取规则
├── sitemap.xml   # 站点地图
└── README.md
```

## 本地预览

```bash
cd heic-to-jpg
python -m http.server 8080
# 打开 http://localhost:8080
```

## 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "init: heic to jpg converter"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在 GitHub 仓库页面：**Settings → Pages → Source 选 `main` 分支 / (root)**，保存后
几分钟内站点会在 `https://<用户名>.github.io/<仓库名>/` 上线。

## 上线后必做

1. **买域名**（可选但强烈推荐，年费约 $10）：Namecheap / Cloudflare 等；
2. **替换占位域名**：`index.html` 里的 canonical、`robots.txt`、`sitemap.xml` 中的
   `YOUR-DOMAIN-HERE.com` 全部换成真实域名；
3. **申请 Google AdSense**：需要网站可正常访问且有一定内容，用根域名申请；
4. **提交搜索引擎**：Google Search Console 提交 sitemap，加速收录；
5. 后续可在页面自然位置加 AdSense 广告单元（建议放在转换区下方和 FAQ 之间）。

## 技术说明

- 转换库：[heic2any](https://github.com/okdshin/heic2any)（libheif 的 JS 封装），CDN 加载
- 批量下载：[JSZip](https://stuk.github.io/jszip/)，CDN 加载，加载失败时自动降级为逐个下载
- 输出：JPEG，质量 92%，文件按原文件名自动改后缀
- 兼容：现代版 Chrome / Edge / Firefox / Safari（Windows、macOS、Android、iOS）
