// Modal — centered overlay surface. Backdrop click closes; inner click doesn't.
import { overlayBackdrop, modal as modalStyle } from '@/lib/components';

export default function Modal({ children, onClose, width = 420 }) {
  return (
    <div style={overlayBackdrop} onClick={onClose}>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width,
          maxWidth: '92vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          // Explicit, not left to the CSS default: when overflowY is
          // anything but 'visible', overflowX with no value of its own
          // computes to 'auto' too (per spec), which means any content that
          // forces horizontal overflow — a long unbroken token like an
          // RRULE string with no spaces — can make the WHOLE modal
          // horizontally scrollable and, worse, render pre-scrolled if
          // something inside triggers a scroll-into-view. No modal in this
          // app should ever need horizontal scroll; pinning this to
          // 'hidden' removes that whole failure class regardless of what
          // any given modal's content does.
          overflowX: 'hidden',
          ...modalStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
