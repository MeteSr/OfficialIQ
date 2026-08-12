import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

// Native shells have no OS print dialog the way a browser tab does, so this
// falls back to the native share sheet instead (the user can save/print/
// share the page URL from there via whatever the OS offers). On web,
// window.print() + the .report-card/@media print CSS already proven in
// issues #22/#26 stays exactly as it was.
export async function exportOrPrint(title: string, url: string = window.location.href): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({ title, url });
  } else {
    window.print();
  }
}
