"""Best-effort observation of this CPU worker only; no system/process inventory."""

import ctypes
import sys
from ctypes import wintypes


def peak_working_set_bytes() -> int | None:
    if sys.platform != "win32":
        return None

    class Counters(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("faults", wintypes.DWORD),
            *[
                (name, ctypes.c_size_t)
                for name in (
                    "peak",
                    "current",
                    "peak_paged",
                    "paged",
                    "peak_nonpaged",
                    "nonpaged",
                    "pagefile",
                    "peak_pagefile",
                )
            ],
        ]

    try:
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        read = ctypes.WinDLL("psapi", use_last_error=True).GetProcessMemoryInfo
        read.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        read.restype = wintypes.BOOL
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        if read(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            return counters.peak
    except OSError:
        pass
    return None
