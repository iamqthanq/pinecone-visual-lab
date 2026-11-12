import { memo } from 'react'

/** Keep the384-cell/table subtree stable when unrelated controls re-render. */
export const VectorValues = memo(function VectorValues({ values, title, table }: { values: number[]; title: string; table: boolean }) {
  if (table) return <div className="vector-table-scroll" tabIndex={0} role="region" aria-label={`${title} numeric values`}><table><caption>All384 dimensions · zero-based index</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Value</th></tr></thead><tbody>{values.map((value, index) => <tr key={index}><th scope="row">{index}</th><td>{value.toPrecision(9)}</td></tr>)}</tbody></table></div>
  return <><div className="vector-heatmap" role="group" aria-label={`${title} 384 dimensions`}>{values.map((value, index) => <span role="img" key={index} title={`Dimension ${index}: ${value}`} aria-label={`Dimension ${index}: ${value.toFixed(6)}`} style={{ background: value >= 0 ? `rgba(124,231,203,${0.15 + Math.min(0.85, Math.abs(value) * 5)})` : `rgba(158,142,247,${0.15 + Math.min(0.85, Math.abs(value) * 5)})` }} />)}</div><p className="config-hint vector-legend"><span>+ Mint ≥0</span><span>− Violet &lt;0</span> · indices0–383 row by row; magnitude changes intensity. Full384D, not a2D projection. Table exposes every value.</p></>
})
