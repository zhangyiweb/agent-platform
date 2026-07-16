/** ZIP 导出统一压缩参数（兼顾体积与主线程耗时） */
export const ZIP_GENERATE_OPTIONS = {
  type: 'blob' as const,
  compression: 'DEFLATE' as const,
  compressionOptions: { level: 6 },
};
