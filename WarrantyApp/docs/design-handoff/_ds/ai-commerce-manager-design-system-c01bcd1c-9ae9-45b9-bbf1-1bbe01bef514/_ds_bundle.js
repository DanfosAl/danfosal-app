/* @ds-bundle: {"format":4,"namespace":"AICommerceManagerDesignSystem_c01bcd","components":[{"name":"ProductCard","sourcePath":"components/commerce/ProductCard.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"EmptyState","sourcePath":"components/core/EmptyState.jsx"},{"name":"KpiCard","sourcePath":"components/core/KpiCard.jsx"},{"name":"ConfirmDialog","sourcePath":"components/feedback/ConfirmDialog.jsx"},{"name":"Message","sourcePath":"components/feedback/Message.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"TextInput","sourcePath":"components/forms/Field.jsx"},{"name":"TextArea","sourcePath":"components/forms/Field.jsx"},{"name":"Select","sourcePath":"components/forms/Field.jsx"},{"name":"NavTab","sourcePath":"components/navigation/NavTab.jsx"}],"sourceHashes":{"components/commerce/ProductCard.jsx":"83a92debfd15","components/core/Badge.jsx":"2e964ca1466b","components/core/Button.jsx":"c10cd658af5c","components/core/Card.jsx":"3893acbf66ba","components/core/EmptyState.jsx":"729cc2545c09","components/core/KpiCard.jsx":"26db55010fa7","components/feedback/ConfirmDialog.jsx":"5198ad9a6fb3","components/feedback/Message.jsx":"999a8d9725e5","components/forms/Field.jsx":"9c1985bb1d04","components/navigation/NavTab.jsx":"3ec3102d72b7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AICommerceManagerDesignSystem_c01bcd = window.AICommerceManagerDesignSystem_c01bcd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/commerce/ProductCard.jsx
try { (() => {
function ProductCard({
  image,
  name,
  sku,
  price,
  salePrice,
  stock = 'instock',
  description
}) {
  const stockLabel = {
    instock: 'Në stok',
    outofstock: 'Pa stok',
    onbackorder: 'Me porosi'
  }[stock];
  const stockTone = {
    instock: 'success',
    outofstock: 'danger',
    onbackorder: 'warning'
  }[stock];
  return /*#__PURE__*/React.createElement("div", {
    className: "dcm-product-card",
    style: {
      minWidth: 0,
      overflow: 'hidden',
      background: 'var(--surface-card)',
      border: '2px solid var(--border-default)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-card-soft)',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("style", null, `.dcm-product-card{transition:transform var(--duration-normal) var(--ease-spring), box-shadow var(--duration-normal) var(--ease-standard);} .dcm-product-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-card);}`), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: 220,
      display: 'grid',
      placeItems: 'center',
      background: 'var(--surface-sunken)',
      borderBottom: '2px solid var(--border-default)'
    }
  }, image ? /*#__PURE__*/React.createElement("img", {
    src: image,
    style: {
      maxWidth: '80%',
      maxHeight: '80%',
      objectFit: 'contain',
      mixBlendMode: 'multiply'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      letterSpacing: '.1em',
      color: 'var(--violet-400)'
    }
  }, "SKU")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 8px',
      color: 'var(--accent-catalog)',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '.08em'
    }
  }, sku), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 14px',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 21,
      lineHeight: 1.2,
      letterSpacing: '-.01em',
      color: 'var(--ink-900)'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12
    }
  }, salePrice ? /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 700,
      color: 'var(--violet-600)'
    }
  }, salePrice), ' ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--fg-faint)',
      fontSize: 14,
      textDecoration: 'line-through'
    }
  }, price)) : /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 700,
      color: 'var(--ink-900)'
    }
  }, price)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      padding: '5px 9px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 11,
      fontWeight: 850,
      color: stockTone === 'success' ? '#0a9c58' : stockTone === 'danger' ? '#c22235' : '#a8710a',
      background: stockTone === 'success' ? 'var(--color-success-soft)' : stockTone === 'danger' ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)'
    }
  }, stockLabel), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '18px 0 0',
      padding: '15px 16px',
      border: '2px solid var(--border-default)',
      borderRadius: 12,
      background: 'var(--surface-sunken)',
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--fg-primary)'
    }
  }, description)));
}
Object.assign(__ds_scope, { ProductCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/commerce/ProductCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const STATUS = {
  neutral: {
    color: 'var(--fg-muted)',
    background: '#eceee8'
  },
  success: {
    color: '#0c8054',
    background: '#def6e9'
  },
  danger: {
    color: '#b12e45',
    background: '#ffe7eb'
  },
  warning: {
    color: '#915712',
    background: '#fff0d2'
  },
  accent: {
    color: '#5a439e',
    background: 'var(--violet-50)'
  }
};
function Badge({
  tone = 'neutral',
  pill = true,
  children
}) {
  const c = STATUS[tone] || STATUS.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '5px 9px',
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-sm)',
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      fontWeight: 850,
      letterSpacing: '.02em',
      ...c
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const VARIANTS = {
  primary: {
    color: '#fff',
    background: 'linear-gradient(135deg,var(--violet-600),var(--violet-400))',
    border: '0',
    minHeight: 48,
    boxShadow: 'var(--shadow-button)'
  },
  secondary: {
    color: 'var(--ink-900)',
    background: '#fff',
    border: '2px solid var(--gray-100)',
    minHeight: 42
  },
  ghost: {
    color: 'var(--fg-muted)',
    background: 'var(--surface-sunken)',
    border: '0',
    minHeight: 40
  },
  danger: {
    color: '#fff',
    background: 'linear-gradient(135deg,#1c1533,#0e0b1f)',
    border: '0',
    minHeight: 42
  },
  select: {
    color: '#fff',
    background: 'linear-gradient(135deg,var(--violet-600),var(--pink-500))',
    border: '0',
    minHeight: 42,
    boxShadow: 'var(--shadow-button)'
  }
};
function Button({
  variant = 'primary',
  disabled = false,
  children,
  onClick,
  type = 'button'
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    onClick: onClick,
    className: `dcm-btn dcm-btn-${variant}`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '0 18px',
      borderRadius: 'var(--radius-md)',
      fontWeight: 800,
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      textDecoration: 'none',
      ...v
    }
  }, /*#__PURE__*/React.createElement("style", null, `
        .dcm-btn{transition:transform var(--duration-normal) var(--ease-spring), box-shadow var(--duration-normal) var(--ease-standard), background var(--duration-fast);}
        .dcm-btn:not(:disabled):hover{transform:translateY(-2px) scale(1.015);}
        .dcm-btn:not(:disabled):active{transform:translateY(0) scale(.97);}
        .dcm-btn-primary:not(:disabled):hover,.dcm-btn-select:not(:disabled):hover{box-shadow:var(--shadow-button-hover);}
      `), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function Card({
  accent,
  padding = 26,
  hover = false,
  children,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: hover ? 'dcm-card-hover' : '',
    style: {
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--surface-card)',
      border: '2px solid var(--border-default)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-card-soft)',
      padding,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, hover && /*#__PURE__*/React.createElement("style", null, `.dcm-card-hover{transition:transform var(--duration-normal) var(--ease-spring), box-shadow var(--duration-normal) var(--ease-standard);} .dcm-card-hover:hover{transform:translateY(-3px);box-shadow:var(--shadow-card);}`), accent && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: '0 0 auto',
      height: 5,
      background: `linear-gradient(90deg, ${accent}, transparent 75%)`
    }
  }), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/EmptyState.jsx
try { (() => {
const BLOBS = {
  violet: ['var(--violet-500)', 'var(--pink-500)'],
  orange: ['var(--orange-500)', 'var(--yellow-400)'],
  cyan: ['var(--cyan-500)', 'var(--blue-500)']
};
function EmptyState({
  tone = 'violet',
  title,
  description
}) {
  const [a, b] = BLOBS[tone] || BLOBS.violet;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      justifyItems: 'center',
      textAlign: 'center',
      gap: 14,
      padding: '36px 20px',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 96,
      height: 96
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '38% 62% 63% 37% / 41% 44% 56% 59%',
      background: `linear-gradient(135deg, ${a}, ${b})`,
      opacity: 0.9
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 22,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-card-soft)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'grid',
      placeItems: 'center',
      fontFamily: 'var(--font-display)',
      fontSize: 28,
      fontWeight: 700,
      color: a
    }
  }, "\u2726")), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 18,
      fontWeight: 700,
      color: 'var(--ink-900)'
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      maxWidth: 320,
      fontSize: 13,
      lineHeight: 1.55,
      color: 'var(--fg-muted)'
    }
  }, description));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/core/KpiCard.jsx
try { (() => {
function KpiCard({
  label,
  value,
  tint = 'var(--violet-500)'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "dcm-kpi",
    style: {
      position: 'relative',
      overflow: 'hidden',
      minWidth: 0,
      padding: 18,
      border: '2px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-card-soft)',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("style", null, `.dcm-kpi{transition:transform var(--duration-normal) var(--ease-spring), box-shadow var(--duration-normal) var(--ease-standard);} .dcm-kpi:hover{transform:translateY(-3px);box-shadow:var(--shadow-card);}`), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -26,
      right: -26,
      width: 78,
      height: 78,
      borderRadius: '50%',
      background: tint,
      opacity: 0.16
    }
  }), /*#__PURE__*/React.createElement("small", {
    style: {
      color: 'var(--fg-muted)',
      fontSize: 12,
      fontWeight: 700
    }
  }, label), /*#__PURE__*/React.createElement("strong", {
    style: {
      display: 'block',
      marginTop: 8,
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(22px,3vw,32px)',
      letterSpacing: '-.02em',
      color: 'var(--ink-900)'
    }
  }, value));
}
Object.assign(__ds_scope, { KpiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/KpiCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ConfirmDialog.jsx
try { (() => {
function ConfirmDialog({
  title,
  description,
  subject,
  warning,
  danger = false,
  confirmLabel = 'Konfirmo',
  onConfirm,
  onCancel
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      background: 'rgba(17,19,15,.55)',
      backdropFilter: 'blur(3px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 'min(560px,100%)',
      maxHeight: '88vh',
      overflowY: 'auto',
      padding: 26,
      borderRadius: 'var(--radius-xl)',
      background: '#fff',
      color: 'var(--ink-900)',
      boxShadow: 'var(--shadow-dialog)',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 10px',
      fontFamily: 'var(--font-display)',
      fontSize: 22,
      fontWeight: 700
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 12px',
      lineHeight: 1.55,
      color: 'var(--fg-muted)'
    }
  }, description), subject && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px',
      fontWeight: 700
    }
  }, subject), warning && /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 0 16px',
      padding: '11px 14px',
      borderRadius: 11,
      borderLeft: '4px solid #e0a500',
      background: 'rgba(255,196,0,.12)',
      lineHeight: 1.5,
      fontSize: 14
    }
  }, warning), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    onClick: onCancel
  }, "Anulo"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: danger ? 'danger' : 'primary',
    onClick: onConfirm
  }, confirmLabel))));
}
Object.assign(__ds_scope, { ConfirmDialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ConfirmDialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Message.jsx
try { (() => {
function Message({
  role = 'assistant',
  children
}) {
  const isUser = role === 'user';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 'fit-content',
      maxWidth: 'min(82%,720px)',
      padding: '11px 14px',
      borderRadius: 14,
      fontFamily: 'var(--font-sans)',
      justifySelf: isUser ? 'end' : 'start',
      borderBottomRightRadius: isUser ? 4 : 14,
      borderBottomLeftRadius: isUser ? 14 : 4,
      color: isUser ? '#3a2c00' : 'var(--ink-900)',
      background: isUser ? 'var(--yellow-300)' : 'var(--violet-50)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginBottom: 4,
      fontSize: 10,
      fontWeight: 850,
      letterSpacing: '.05em',
      textTransform: 'uppercase',
      opacity: 0.72
    }
  }, isUser ? 'Ju' : 'Asistenti'), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.55
    }
  }, children));
}
Object.assign(__ds_scope, { Message });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Message.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const baseFieldStyle = {
  width: '100%',
  fontFamily: 'var(--font-sans)',
  color: 'var(--fg-primary)',
  border: '1px solid #dedfeb',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface-field)',
  outline: 'none',
  transition: 'border .2s, box-shadow .2s',
  fontSize: 14
};
function Field({
  label,
  hint,
  children
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'grid',
      gap: 8,
      fontFamily: 'var(--font-sans)',
      color: '#4d4f66',
      fontSize: 13,
      fontWeight: 750
    }
  }, label, children, hint && /*#__PURE__*/React.createElement("small", {
    style: {
      color: 'var(--fg-muted)',
      fontWeight: 500
    }
  }, hint));
}
function TextInput(props) {
  return /*#__PURE__*/React.createElement("input", _extends({}, props, {
    style: {
      ...baseFieldStyle,
      height: 48,
      padding: '0 14px'
    },
    onFocus: e => e.target.style.boxShadow = '0 0 0 4px rgba(108,92,231,.13)',
    onBlur: e => e.target.style.boxShadow = 'none'
  }));
}
function TextArea(props) {
  return /*#__PURE__*/React.createElement("textarea", _extends({}, props, {
    rows: props.rows || 4,
    style: {
      ...baseFieldStyle,
      minHeight: 130,
      padding: 18,
      lineHeight: 1.5,
      resize: 'vertical'
    }
  }));
}
function Select({
  options = [],
  ...props
}) {
  return /*#__PURE__*/React.createElement("select", _extends({}, props, {
    style: {
      ...baseFieldStyle,
      height: 48,
      padding: '0 40px 0 14px'
    }
  }), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value ?? o,
    value: o.value ?? o
  }, o.label ?? o)));
}
Object.assign(__ds_scope, { Field, TextInput, TextArea, Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavTab.jsx
try { (() => {
function NavTab({
  glyph,
  label,
  sublabel,
  active = false,
  accent = 'var(--violet-500)',
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    className: `dcm-navtab${active ? ' dcm-navtab-active' : ''}`,
    style: {
      position: 'relative',
      width: '100%',
      minHeight: 53,
      display: 'grid',
      '--dcm-tab-grad': `linear-gradient(135deg, ${accent}, #9f6aef)`,
      gridTemplateColumns: '34px minmax(0,1fr)',
      gridTemplateRows: 'auto auto',
      columnGap: 10,
      alignItems: 'center',
      margin: '3px 0',
      padding: '8px 10px',
      border: 0,
      borderRadius: 14,
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      color: active ? '#3f2094' : '#595c72',
      background: active ? 'linear-gradient(90deg, var(--violet-50), #f7f5ff)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("style", null, `
        .dcm-navtab{transition:background var(--duration-fast);}
        .dcm-navtab:not(.dcm-navtab-active):hover{background:var(--surface-sunken);}
        .dcm-navtab-glyph{transition:transform var(--duration-normal) var(--ease-spring), background var(--duration-fast);}
        .dcm-navtab:not(.dcm-navtab-active):hover .dcm-navtab-glyph{background:var(--dcm-tab-grad);color:#fff;transform:scale(1.08);}
      `), active && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: '7px auto 7px 0',
      width: 3,
      borderRadius: '0 4px 4px 0',
      background: accent
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "dcm-navtab-glyph",
    style: {
      gridColumn: 1,
      gridRow: '1 / 3',
      width: 34,
      height: 34,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 11,
      fontSize: 15,
      fontWeight: 900,
      color: active ? '#fff' : '#706f82',
      background: active ? `linear-gradient(135deg, ${accent}, #9f6aef)` : '#f0f1f7'
    }
  }, glyph), /*#__PURE__*/React.createElement("span", {
    style: {
      gridColumn: 2,
      gridRow: 1,
      fontSize: 13,
      fontWeight: 800,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, label), sublabel && /*#__PURE__*/React.createElement("small", {
    style: {
      gridColumn: 2,
      gridRow: 2,
      fontSize: 9,
      fontWeight: 650,
      color: '#9b9caf',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, sublabel));
}
Object.assign(__ds_scope, { NavTab });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavTab.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ProductCard = __ds_scope.ProductCard;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.KpiCard = __ds_scope.KpiCard;

__ds_ns.ConfirmDialog = __ds_scope.ConfirmDialog;

__ds_ns.Message = __ds_scope.Message;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.TextArea = __ds_scope.TextArea;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.NavTab = __ds_scope.NavTab;

})();
