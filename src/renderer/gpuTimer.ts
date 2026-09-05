// Read only completed queries: never wait for the GPU on the input thread.
// Browsers without timer queries use frame cadence alone.
export class GpuTimer {
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  private pending: WebGLQuery[] = []
  private active: WebGLQuery | null = null
  private frame = 0
  private sampleMs: number | undefined
  private sampledAt = -Infinity

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  }

  poll(now: number): number | undefined {
    const { gl, ext } = this
    if (!ext) return undefined
    if (this.pending.length && gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const query of this.pending) gl.deleteQuery(query)
      this.pending.length = 0
      this.sampleMs = undefined
    }
    const query = this.pending[0]
    if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      this.sampleMs = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6
      this.sampledAt = now
      gl.deleteQuery(query)
      this.pending.shift()
    }
    return now - this.sampledAt < 500 ? this.sampleMs : undefined
  }

  begin(): void {
    if (!this.ext || this.pending.length >= 4 || this.frame++ % 8 !== 0) return
    this.active = this.gl.createQuery()
    if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active)
  }

  end(): void {
    if (!this.active || !this.ext) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pending.push(this.active)
    this.active = null
  }
}
