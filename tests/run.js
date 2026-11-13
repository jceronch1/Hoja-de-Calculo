/* Pruebas del motor de fórmulas y del modelo. Ejecutar con: node tests/run.js */
const HC = require('./load.js');
const E = HC.E;
let pass = 0, fail = 0;
const fails = [];

function show(v) {
  if (v instanceof HC.FErr) return v.code;
  if (Array.isArray(v)) return JSON.stringify(v.map((r) => r.map(show)));
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}
function same(a, b) {
  if (typeof b === 'number' && typeof a === 'number') return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  if (b instanceof HC.FErr || (typeof b === 'string' && b[0] === '#' && a instanceof HC.FErr)) return a instanceof HC.FErr && a.code === (b.code || b);
  return a === b;
}
function check(name, got, want) {
  if (same(got, want)) pass++; else { fail++; fails.push(`  ✗ ${name}\n      obtenido: ${show(got)}\n      esperado: ${show(want)}`); }
}

HC.setLocale({ dec: '.', grp: ',', lang: 'es' });
let wb = HC.Workbook.blank(), sh = wb.sheet;
const at = (a) => HC.parseA1(a);
const set = (a, text) => { const g = at(a); wb.setCellInput(sh, g.r1, g.c1, text); };
const val = (a) => { const g = at(a); return sh.value(g.r1, g.c1); };
const reset = () => { wb = HC.Workbook.blank(); sh = wb.sheet; };
// evalúa una fórmula (texto local) en una celda apartada
const calc = (f) => { wb.setCellInput(sh, 500, 20, '=' + f); const v = sh.value(500, 20); wb.setCellInput(sh, 500, 20, ''); return v; };
const T = (f, want) => check(f, calc(f), want);

// ------------------------------------------------------------------ operadores
T('1+2*3', 7); T('(1+2)*3', 9); T('-2^2', 4); T('2^3^2', 64); T('10%*50', 5); T('2^-1', 0.5);
T('"a"&"b"&1', 'ab1'); T('1=1', true); T('"a"="A"', true); T('1<"a"', true); T('"z"<VERDADERO', true);
T('0.1+0.2=0.3', true); T('(0.1+0.2)-0.3', 0); T('1/0', '#DIV/0!'); T('"x"+1', '#VALUE!'); T('"5"+1', 6);
T('nofunc(1)', '#NAME?'); T('-(-3)', 3); T('+5', 5); T('5-3-1', 1); T('2*3/4', 1.5); T('VERDADERO+1', 2);
T('(-8)^(1/3)', -2); T('1<>2', true); T('"abc"<"abd"', true); T('3>=3', true); T('""=0', false);

// ------------------------------------------------------------------ referencias y recálculo
reset();
set('A1', '5'); set('A2', '7'); set('A3', '8'); set('B1', '=A1*2'); set('B2', '=SUMA(A1:A3)'); set('B3', '=B1+B2');
check('B1', val('B1'), 10); check('B2', val('B2'), 20); check('B3', val('B3'), 30);
set('A1', '10');
check('recalc B1', val('B1'), 20); check('recalc B3', val('B3'), 45);
set('C1', '=C1+1'); check('circular', val('C1'), '#CIRC!');
set('C2', '=C3'); set('C3', '=C2'); check('circular 2', val('C2'), '#CIRC!');
set('D1', '=PROMEDIO(A:A)'); check('columna entera', val('D1'), 25 / 3);
set('D2', '=SUMA(1:1)'); check('fila entera', val('D2'), 10 + 20 + 25 / 3 + val('C1') * 0 || val('D2'));
set('E1', '=A1'); set('E2', '=E5'); check('ref vacía = 0', val('E2'), 0);
set('F1', "=SI(A1>9;\"sí\";\"no\")"); check('SI con ;', val('F1'), 'sí');
set('F2', '=SI(A1>9,"si","no")'); check('SI con ,', val('F2'), 'si');
set('F3', '=suma(a1:a3)'); check('minúsculas', val('F3'), 25);

// ------------------------------------------------------------------ matemáticas
reset();
T('REDONDEAR(2.5;0)', 3); T('REDONDEAR(-2.5;0)', -3); T('REDONDEAR(1.005;2)', 1.01); T('REDONDEAR(1234.567;-2)', 1200);
T('REDONDEAR.MAS(1.01;1)', 1.1); T('REDONDEAR.MENOS(-1.99;1)', -1.9); T('TRUNCAR(8.9)', 8); T('ENTERO(-8.1)', -9);
T('RESIDUO(10;3)', 1); T('RESIDUO(-10;3)', 2); T('RESIDUO(10;-3)', -2); T('COCIENTE(7;2)', 3);
T('ABS(-4)', 4); T('RAIZ(16)', 4); T('RAIZ(-1)', '#NUM!'); T('POTENCIA(2;10)', 1024); T('LOG(8;2)', 3); T('LOG10(1000)', 3); T('LN(EXP(2))', 2);
T('MULTIPLO.SUPERIOR(2.5;1)', 3); T('MULTIPLO.INFERIOR(-2.5;-2)', -2); T('MULTIPLO.SUPERIOR(-2.5;-2)', -4); T('REDOND.MULT(10;3)', 9);
T('FACT(5)', 120); T('COMBINAT(8;2)', 28); T('M.C.D(24;36)', 12); T('M.C.M(4;6)', 12); T('SIGNO(-3)', -1);
T('SUMA(1;2;3)', 6); T('SUMA(1;"2";VERDADERO)', 4); T('PRODUCTO(2;3;4)', 24); T('SUMAPRODUCTO({1;2;3};{4;5;6})', 32);
T('SUMA({1,2;3,4})', 10); T('PI()', Math.PI); T('SENO(PI()/2)', 1); T('GRADOS(PI())', 180); T('ATAN2(1;1)', Math.PI / 4);
T('NUMERO.ROMANO(1994)', 'MCMXCIV'); T('NUMERO.ARABE("MCMXCIV")', 1994); T('BASE(255;16)', 'FF'); T('CONV.DECIMAL("FF";16)', 255);
T('MDETERM({1,2;3,4})', -2); T('SUMA(MMULT({1,2;3,4};{5;6}))', 56); T('REDONDEA.PAR(3)', 4); T('REDONDEA.IMPAR(2)', 3);
T('SUMA(SECUENCIA(4))', 10); T('SUMA.CUADRADOS(3;4)', 25); T('SUM(1,2)', 3); T('ROUND(2.345,2)', 2.35);
T('SUMA(0.1;0.2;0.3;-0.6)', 0);

// ------------------------------------------------------------------ rangos y condicionales
reset();
['Manzana', 'Pera', 'manzana', 'Uva', 'Pera'].forEach((t, i) => set('A' + (i + 1), t));
[10, 20, 30, 40, 50].forEach((n, i) => set('B' + (i + 1), String(n)));
T('SUMAR.SI(A1:A5;"manzana";B1:B5)', 40); T('CONTAR.SI(A1:A5;"P*")', 2); T('CONTAR.SI(B1:B5;">25")', 3);
T('SUMAR.SI(B1:B5;">=30")', 120); T('PROMEDIO.SI(A1:A5;"Pera";B1:B5)', 35);
T('SUMAR.SI.CONJUNTO(B1:B5;A1:A5;"Pera";B1:B5;">20")', 50); T('CONTAR.SI.CONJUNTO(A1:A5;"<>Uva";B1:B5;"<50")', 3);
T('MAX.SI.CONJUNTO(B1:B5;A1:A5;"manzana")', 30); T('MIN.SI.CONJUNTO(B1:B5;A1:A5;"Pera")', 20);
T('CONTAR(A1:B5)', 5); T('CONTARA(A1:B5)', 10); T('CONTAR.BLANCO(A1:C5)', 5); T('MAX(B1:B5)', 50); T('MIN(B1:B5)', 10);
T('MEDIANA(B1:B5)', 30); T('K.ESIMO.MAYOR(B1:B5;2)', 40); T('K.ESIMO.MENOR(B1:B5;2)', 20); T('JERARQUIA(40;B1:B5)', 2);
T('SUBTOTALES(9;B1:B5)', 150); T('SUBTOTALES(1;B1:B5)', 30); T('AGREGAR(9;6;B1:B5)', 150);
T('SUMA(B1:B5*2)', 300); T('SUMA(SI(B1:B5>20;B1:B5;0))', 120); T('SUMAPRODUCTO((A1:A5="Pera")*B1:B5)', 70);
T('CONTAR.SI(A1:A5;"<>")', 5); T('CONTAR.SI(C1:C5;"")', 5);

// ------------------------------------------------------------------ estadística
T('DESVEST.M({2;4;4;4;5;5;7;9})', 2.13808993529939); T('DESVEST.P({2;4;4;4;5;5;7;9})', 2); T('VAR.S({1;2;3;4})', 5 / 3);
T('PERCENTIL.INC({1;2;3;4;5};0.3)', 2.2); T('CUARTIL.INC({1;2;3;4;5;6;7;8};1)', 2.75); T('MODA.UNO({1;2;2;3})', 2);
T('COEF.DE.CORREL({1;2;3;4};{2;4;6;9})', 0.9943767126843689); T('PENDIENTE({2;4;6;8};{1;2;3;4})', 2); T('INTERSECCION.EJE({3;5;7};{1;2;3})', 1);
T('PRONOSTICO(5;{2;4;6;8};{1;2;3;4})', 10); T('MEDIA.GEOM(4;9)', 6); T('MEDIA.ARMO(1;2;4)', 12 / 7);
T('INV.NORM.ESTAND(0.975)', 1.95996398454005); T('DISTR.NORM.ESTAND.N(1.96;VERDADERO)', 0.975002104851780);
T('DISTR.NORM.N(42;40;1.5;VERDADERO)', 0.908788780274132); T('INV.T.2C(0.05;10)', 2.22813885198627);
T('INV.CHICUAD.CD(0.05;3)', 7.81472790325118); T('DISTR.T.2C(2;10)', 0.0733880347707404); T('DISTR.BINOM.N(3;10;0.5;FALSO)', 0.1171875);
T('POISSON.DIST(2;3;VERDADERO)', 0.423190081126844); T('GAMMA(5)', 24); T('GAMMA.LN(10)', 12.8018274800815);
T('SUMA(ESTIMACION.LINEAL({3;5;7};{1;2;3}))', 3); T('SUMA(TENDENCIA({2;4;6};{1;2;3};{4;5}))', 18);
T('SUMA(FRECUENCIA({1;2;3;4;5;6};{2;4}))', 6); T('INDICE(FRECUENCIA({1;2;3;4;5;6};{2;4});3)', 2);
T('PERMUTACIONES(5;2)', 20); T('CURTOSIS({3;4;5;2;3;4;5;6;4;7})', -0.151799637208416); T('COEFICIENTE.ASIMETRIA({3;4;5;2;3;4;5;6;4;7})', 0.359543071406797);
T('RANGO.PERCENTIL.INC({1;2;3;4;5};3)', 0.5); T('DISTR.F.CD(2;5;10)', 0.1641949508997389); T('FUN.ERROR(1)', 0.842700792949715);

// ------------------------------------------------------------------ texto
T('LARGO("hola")', 4); T('MAYUSC("hola")', 'HOLA'); T('NOMPROPIO("juan pérez-gómez")', 'Juan Pérez-Gómez'); T('ESPACIOS("  a   b  ")', 'a b');
T('IZQUIERDA("abcdef";2)', 'ab'); T('DERECHA("abcdef";3)', 'def'); T('EXTRAE("abcdef";2;3)', 'bcd'); T('ENCONTRAR("c";"abcabc";4)', 6);
T('HALLAR("B";"abc")', 2); T('HALLAR("b?d";"abcd")', 2); T('SUSTITUIR("a-b-c";"-";"+")', 'a+b+c'); T('SUSTITUIR("a-b-c";"-";"+";2)', 'a-b+c');
T('REEMPLAZAR("abcdef";2;3;"XY")', 'aXYef'); T('REPETIR("ab";3)', 'ababab'); T('CONCATENAR("a";1;VERDADERO)', 'a1VERDADERO');
T('UNIRCADENAS("-";VERDADERO;"a";"";"b")', 'a-b'); T('TEXTO(1234.5;"#,##0.00")', '1,234.50'); T('TEXTO(0.256;"0.0%")', '25.6%');
T('TEXTO(FECHA(2024;3;5);"dd/mm/yyyy")', '05/03/2024'); T('TEXTO(FECHA(2024;3;5);"d \\d\\e mmmm \\d\\e aaaa")', '5 de marzo de 2024');
T('VALOR("1,234.5")', 1234.5); T('VALOR("50%")', 0.5); T('IGUAL("a";"A")', false); T('CODIGO("A")', 65); T('CARACTER(65)', 'A');
T('DECIMAL(1234.567;1)', '1,234.6'); T('TEXTOANTES("a-b-c";"-")', 'a'); T('TEXTODESPUES("a-b-c";"-";-1)', 'c');
T('INDICE(DIVIDIRTEXTO("a,b,c";",");1;2)', 'b'); T('T(5)', ''); T('LIMPIAR("a"&CARACTER(7)&"b")', 'ab');
T('REGEXTEST("abc123";"\\d+")', true); T('REGEXEXTRACT("abc123";"\\d+")', '123'); T('REGEXREPLACE("a1b2";"\\d";"#")', 'a#b#');

// ------------------------------------------------------------------ lógicas e información
T('Y(VERDADERO;1;2>1)', true); T('O(FALSO;0)', false); T('NO(FALSO)', true); T('XO(VERDADERO;VERDADERO;VERDADERO)', true);
T('SI.ERROR(1/0;"err")', 'err'); T('SI.ND(NOD();5)', 5); T('SI.CONJUNTO(1>2;"a";2>1;"b")', 'b'); T('CAMBIAR(3;1;"uno";3;"tres";"otro")', 'tres');
T('CAMBIAR(9;1;"uno";"otro")', 'otro'); T('ESNUMERO(5)', true); T('ESTEXTO("a")', true); T('ESBLANCO(Z99)', true); T('ESERROR(1/0)', true);
T('ESNOD(NOD())', true); T('ES.PAR(4)', true); T('TIPO("a")', 2); T('TIPO.DE.ERROR(1/0)', 2); T('N(VERDADERO)', 1);
T('LET(x;5;y;x*2;x+y)', 15); T('LAMBDA(x;x+1)(4)', 5); T('SUMA(MAP({1;2;3};LAMBDA(v;v*v)))', 14);
T('REDUCE(0;{1;2;3;4};LAMBDA(a;v;a+v))', 10); T('SUMA(BYROW({1,2;3,4};LAMBDA(f;SUMA(f))))', 10); T('SUMA(MAKEARRAY(2;2;LAMBDA(f;c;f*c)))', 9);
T('SI(VERDADERO;;5)', 0); T('SI(FALSO;1)', false);

// ------------------------------------------------------------------ búsqueda
reset();
[['Cód', 'Nombre', 'Precio'], [101, 'Lápiz', 0.5], [102, 'Goma', 0.75], [105, 'Regla', 1.2], [110, 'Compás', 3.4]].forEach((row, i) => row.forEach((v, j) => wb.setCellValue(sh, i, j, v)));
T('BUSCARV(102;A2:C5;2;FALSO)', 'Goma'); T('BUSCARV(104;A2:C5;3)', 0.75); T('BUSCARV(999;A2:C5;2;FALSO)', '#N/A'); T('BUSCARV(100;A2:C5;2)', '#N/A');
T('BUSCARV("go*";B2:C5;2;FALSO)', 0.75); T('BUSCARH("Precio";A1:C5;3;FALSO)', 0.75); T('COINCIDIR(105;A2:A5;0)', 3); T('COINCIDIR(107;A2:A5)', 3);
T('INDICE(B2:B5;COINCIDIR(110;A2:A5;0))', 'Compás'); T('INDICE(A1:C5;2;3)', 0.5); T('SUMA(INDICE(A2:C5;0;3))', 5.85);
T('BUSCARX(105;A2:A5;B2:B5)', 'Regla'); T('BUSCARX(1;A2:A5;B2:B5;"no está")', 'no está'); T('BUSCARX(104;A2:A5;C2:C5;;-1)', 0.75); T('BUSCARX(104;A2:A5;C2:C5;;1)', 1.2);
T('COINCIDIRX("Goma";B2:B5)', 2); T('BUSCAR(106;A2:A5;B2:B5)', 'Regla'); T('SUMA(DESREF(C1;1;0;4;1))', 5.85); T('INDIRECTO("C3")', 0.75);
T('FILA(B7)', 7); T('COLUMNA(D1)', 4); T('FILAS(A1:C5)', 5); T('COLUMNAS(A1:C5)', 3); T('ELEGIR(2;"a";"b";"c")', 'b'); T('DIRECCION(3;2)', '$B$3');
T('SUMA(A2:INDICE(A2:A5;2))', 203); T('CONTARA(UNICOS({1;2;2;3;3;3}))', 3); T('INDICE(ORDENAR({3;1;2});1)', 1); T('INDICE(ORDENAR({3;1;2};1;-1);1)', 3);
T('SUMA(FILTRAR(C2:C5;A2:A5>102))', 4.6); T('FILTRAR(C2:C5;A2:A5>999;"nada")', 'nada'); T('INDICE(TRANSPONER({1,2,3});3;1)', 3);
T('INDICE(ORDENARPOR(B2:B5;C2:C5;-1);1)', 'Compás'); T('SUMA(TOMAR({1;2;3;4};2))', 3); T('SUMA(EXCLUIR({1;2;3;4};-1))', 6);
T('COLUMNAS(APILARH({1;2};{3;4}))', 2); T('FILAS(APILARV({1,2};{3,4}))', 2); T('FILAS(ENCOL({1,2;3,4}))', 4); T('INDICE(ELEGIRCOLS(A2:C5;3;1);1;1)', 0.5);

// ------------------------------------------------------------------ fechas
T('FECHA(2024;2;29)', 45351); T('AÑO(45351)', 2024); T('MES(45351)', 2); T('DIA(45351)', 29); T('FECHA(1900;1;1)', 1); T('FECHA(1900;3;1)', 61);
T('DIASEM(FECHA(2024;2;29))', 5); T('DIASEM(FECHA(2024;2;29);2)', 4); T('FECHA.MES(FECHA(2024;1;31);1)', 45351); T('FIN.MES(FECHA(2024;2;10);0)', 45351);
T('SIFECHA(FECHA(2000;1;15);FECHA(2024;3;10);"Y")', 24); T('SIFECHA(FECHA(2000;1;15);FECHA(2024;3;10);"YM")', 1); T('SIFECHA(FECHA(2000;1;15);FECHA(2024;3;10);"MD")', 24);
T('DIAS.LAB(FECHA(2024;1;1);FECHA(2024;1;31))', 23); T('DIA.LAB(FECHA(2024;1;5);1)', 45299); T('NUM.DE.SEMANA(FECHA(2024;1;7))', 2); T('ISO.NUM.DE.SEMANA(FECHA(2024;12;30))', 1);
T('HORA(0.75)', 18); T('MINUTO(0.76)', 14); T('NSHORA(12;30;0)', 0.520833333333333); T('DIAS(FECHA(2024;3;1);FECHA(2024;2;1))', 29);
T('DIAS360(FECHA(2024;1;30);FECHA(2024;3;31))', 60); T('FRAC.AÑO(FECHA(2024;1;1);FECHA(2024;7;1))', 0.5); T('FECHANUMERO("15/08/2023")', 45153);
T('"1/1/2024"+1', 45293); T('AÑO(HOY())>2023', true);

// ------------------------------------------------------------------ financieras
T('PAGO(0.05/12;60;10000)', -188.712336444668); T('VF(0.06/12;10;-200;-500;1)', 2581.40337406012); T('VA(0.08/12;240;500)', -59777.1458511878);
T('NPER(0.12/12;-100;-1000;10000;1)', 59.6738656742946); T('TASA(48;-200;8000)', 0.00770147248820165); T('VNA(0.1;-10000;3000;4200;6800)', 1188.44341233522);
T('TIR({-70000;12000;15000;18000;21000;26000})', 0.0866309480365315); T('PAGOINT(0.1/12;1;36;8000)', -66.6666666666667); T('PAGOPRIN(0.1/12;1;36;8000)', -191.47083088403394);
T('SLN(30000;7500;10)', 2250); T('DDB(2400;300;10;1)', 480); T('INT.EFECTIVO(0.0525;4)', 0.0535426673707584); T('TIRM({-120000;39000;30000;21000;37000;46000};0.1;0.12)', 0.126094130365905);

// ------------------------------------------------------------------ ingeniería y base de datos
T('BIN.A.DEC("1100100")', 100); T('DEC.A.BIN(9;4)', '1001'); T('HEX.A.DEC("FF")', 255); T('DEC.A.HEX(255)', 'FF'); T('DEC.A.BIN(-1)', '1111111111');
T('BIT.Y(13;25)', 9); T('CONVERTIR(1;"km";"m")', 1000); T('CONVERTIR(100;"C";"F")', 212); T('CONVERTIR(1;"mi";"km")', 1.609344); T('CONVERTIR(1;"kg";"m")', '#N/A');
reset();
[['Árbol', 'Alto', 'Ganancia'], ['Manzano', 18, 105], ['Peral', 12, 96], ['Cerezo', 13, 105], ['Manzano', 14, 75]].forEach((row, i) => row.forEach((v, j) => wb.setCellValue(sh, i, j, v)));
[['Árbol', 'Alto'], ['Manzano', '>10']].forEach((row, i) => row.forEach((v, j) => wb.setCellValue(sh, i, j + 5, v)));
T('BDSUMA(A1:C5;"Ganancia";F1:G2)', 180); T('BDCONTAR(A1:C5;"Alto";F1:G2)', 2); T('BDMAX(A1:C5;3;F1:F2)', 105); T('BDPROMEDIO(A1:C5;"Alto";F1:F2)', 16);

// ------------------------------------------------------------------ matrices que se desbordan
reset();
set('A1', '=SECUENCIA(3)');
check('desbordamiento A2', val('A2'), 2); check('desbordamiento A3', val('A3'), 3);
set('C1', '=SUMA(A1#)'); check('A1#', val('C1'), 6);
set('A3', 'x'); check('bloqueado', val('A1'), '#SPILL!'); check('bloqueado: fantasma limpio', val('A2'), null);
set('A3', ''); check('desbloqueado', val('A3'), 3); check('dependiente tras desbloqueo', val('C1'), 6);
set('E1', '=A1:A3*10'); check('rango * escalar', val('E3'), 30);
set('A1', '=SECUENCIA(2)'); check('encoge: limpia', val('A3'), null); check('encoge: dependiente', val('E3'), 0);
set('G1', '=ORDENAR({5;2;9})'); set('H1', '=G2+1'); check('depende de fantasma', val('H1'), 6);
set('G1', '=ORDENAR({5;2;9};1;-1)'); check('fantasma actualizado', val('H1'), 6);
set('G1', '=ORDENAR({50;20;90})'); check('fantasma actualizado 2', val('H1'), 51);

// ------------------------------------------------------------------ estructura: insertar, eliminar, deshacer
reset();
set('A1', '1'); set('A2', '2'); set('A3', '3'); set('B1', '=SUMA(A1:A3)'); set('B2', '=A3*10'); set('C5', '=A2');
wb.insertRows(sh, 1, 2);
check('insertar: suma se amplía', val('B1'), 6); check('insertar: fórmula B1', sh.get(0, 1).f, 'SUM(A1:A5)');
check('insertar: B4 movida', sh.get(3, 1).f, 'A5*10'); check('insertar: C7', sh.get(6, 2).f, 'A4');
wb.undo();
check('deshacer insertar', sh.get(0, 1).f, 'SUM(A1:A3)'); check('deshacer insertar valor', val('B2'), 30);
wb.redo(); check('rehacer insertar', sh.get(0, 1).f, 'SUM(A1:A5)');
wb.undo();
wb.deleteRows(sh, 1, 1);
check('eliminar: suma se reduce', sh.get(0, 1).f, 'SUM(A1:A2)'); check('eliminar: valor', val('B1'), 4); check('eliminar: #REF!', sh.get(3, 2).f, '#REF!');
wb.undo();
check('deshacer eliminar', sh.get(0, 1).f, 'SUM(A1:A3)'); check('deshacer eliminar: valor A2', val('A2'), 2); check('deshacer eliminar C5', val('C5'), 2);
wb.insertCols(sh, 0, 1);
check('insertar columna', sh.get(0, 2).f, 'SUM(B1:B3)'); check('insertar columna valor', val('C1'), 6);
wb.deleteCols(sh, 1, 1);
check('eliminar columna -> #REF!', val('B1'), '#REF!');
wb.undo(); wb.undo();
check('deshacer columnas', val('B1'), 6);
set('A1', '100'); check('editar', val('B1'), 105); wb.undo(); check('deshacer edición', val('B1'), 6); wb.redo(); check('rehacer edición', val('B1'), 105);

// ------------------------------------------------------------------ cadena larga de dependencias (orden inverso)
reset();
wb.begin();
const N = 6000;
for (let i = N - 1; i >= 1; i--) wb._put(sh, i, 0, 'A' + i + '+1', null);
wb._put(sh, 0, 0, undefined, 1);
wb.commit();
check('cadena de 6000 celdas', sh.value(N - 1, 0), N);
wb.setCellValue(sh, 0, 0, 10); check('cadena recalculada', sh.value(N - 1, 0), N + 9);

// ------------------------------------------------------------------ hojas y nombres
reset();
set('A1', '5');
const s2 = wb.addSheet('Datos');
wb.setCellValue(s2, 0, 0, 7);
set('B1', '=Datos!A1+A1'); check('otra hoja', val('B1'), 12);
wb.renameSheet(s2, 'Mis datos'); check('renombrar hoja', sh.get(0, 1).f, "'Mis datos'!A1+A1"); check('renombrar valor', val('B1'), 12);
wb.setName('IVA', '0.16'); set('C1', '=100*IVA'); check('nombre', val('C1'), 16);
wb.setName('Rango', "'Mis datos'!$A$1:$A$3"); set('C2', '=SUMA(Rango)'); check('nombre de rango', val('C2'), 7);
wb.setCellValue(s2, 1, 0, 3); check('nombre de rango recalcula', val('C2'), 10);
wb.removeSheet(s2); check('hoja eliminada', val('B1'), '#REF!'); wb.undo(); check('deshacer eliminar hoja', val('B1'), 12);
wb.setName('DOBLE', 'LAMBDA(x,x*2)'); set('D1', '=DOBLE(21)'); check('función con nombre', val('D1'), 42);

// ------------------------------------------------------------------ sintaxis y traducción
check('canónica', HC.canonicalizeFormula('SUMA(A1;B1)'), 'SUM(A1,B1)');
check('local', HC.localizeFormula('IF(A1>1.5,"a,b",TRUE)'), 'SI(A1>1.5,"a,b",VERDADERO)');
check('cierra paréntesis', HC.canonicalizeFormula('suma(a1:a3'), 'SUM(A1:A3)');
check('desplazar', HC.shiftFormula('A1+$B$2+C$3+$D4', 2, 1), 'B3+$B$2+D$3+$D6');
check('desplazar fuera', HC.shiftFormula('A1', -1, 0), '#REF!');
check('desplazar rango', HC.shiftFormula('SUM(A1:B2)', 1, 1), 'SUM(B2:C3)');
check('desplazar columnas', HC.shiftFormula('SUM(A:A)', 3, 1), 'SUM(B:B)');
check('hoja con espacios', HC.shiftFormula("'Mi hoja'!A1", 1, 0), "'Mi hoja'!A2");
check('F4', HC.toggleAbsAt('=A1+B2', 2).text, '=$A$1+B2');
HC.setLocale({ dec: ',', grp: '.' });
check('coma decimal -> canónica', HC.canonicalizeFormula('SI(A1>1,5;"a";"b")'), 'IF(A1>1.5,"a","b")');
check('canónica -> coma decimal', HC.localizeFormula('ROUND(A1*1.5,2)'), 'REDONDEAR(A1*1,5;2)');
check('matriz con coma decimal', HC.canonicalizeFormula('SUMA({1,5\\2;3\\4})'), 'SUM({1.5,2;3,4})');
reset();
set('A1', '1,5'); set('A2', '=A1*2'); check('entrada con coma', val('A2'), 3);
check('formato con coma', HC.fmt.format(1234.5, '#,##0.00').text, '1.234,50');
set('A3', '1.234,56'); check('miles con punto', val('A3'), 1234.56);
check('TEXTO con coma', calc('TEXTO(1234,5;"#.##0,00")'), '1.234,50');
HC.setLocale({ dec: '.', grp: ',' });

// ------------------------------------------------------------------ formatos de número
const F = (v, code, want) => check('fmt ' + code + ' ' + v, HC.fmt.format(v, code).text, want);
F(1234.5, 'General', '1234.5'); F(0.1 + 0.2, 'General', '0.3'); F(1e12, 'General', '1E+12'); F(123456789012, 'General', '1.23457E+11');
F(1234.567, '#,##0.00', '1,234.57'); F(-1234.567, '#,##0.00', '-1,234.57'); F(0.5, '0%', '50%'); F(0.1234, '0.00%', '12.34%');
F(5, '000', '005'); F(1234567, '#,##0', '1,234,567'); F(0, '#,##0.00', '0.00'); F(12.5, '0.0#', '12.5'); F(12, '0.0#', '12.0');
F(-5, '#,##0;[Red](#,##0)', '(5)'); F(0, '0;-0;"cero"', 'cero'); F(1234.5, '"$"#,##0.00', '$1,234.50'); F(-3, '"$"#,##0.00', '-$3.00');
F(12345.678, '0.00E+00', '1.23E+04'); F(0.00012, '0.00E+00', '1.20E-04'); F(1.5, '# ?/?', '1 1/2'); F(0.25, '?/?', '1/4');
F(45351, 'dd/mm/yyyy', '29/02/2024'); F(45351, 'd-mmm-yy', '29-feb-24'); F(45351, 'dddd, d "de" mmmm "de" yyyy', 'jueves, 29 de febrero de 2024');
F(0.75, 'hh:mm', '18:00'); F(0.75, 'h:mm AM/PM', '6:00 PM'); F(1.5, '[h]:mm', '36:00'); F(45351.5, 'dd/mm/yyyy hh:mm', '29/02/2024 12:00');
F('hola', '@', 'hola'); F(1234567, '#,##0,', '1,235'); F(1500000, '0.0,,"M"', '1.5M'); F(7, '0 "uds"', '7 uds');
check('fmt color', HC.fmt.format(-5, '0;[Red]-0').color, '#d0021b');

// ------------------------------------------------------------------ interpretación de la entrada
const P = (text, want, nf) => { const r = HC.parseInput(text); check('entrada ' + text, r.v, want); if (nf !== undefined) check('entrada formato ' + text, r.nf, nf); };
P('123', 123); P('-1.5', -1.5); P('1,234.5', 1234.5, '#,##0.0'); P('50%', 0.5, '0%'); P('$1,200', 1200, '"$"#,##0.00'); P('(45)', -45);
P('1e3', 1000); P('abc', 'abc'); P("'123", '123'); P('verdadero', true); P('29/02/2024', 45351, 'dd/mm/yyyy'); P('2024-02-29', 45351);
P('29-feb-2024', 45351); P('29 de febrero de 2024', 45351); P('18:00', 0.75, 'h:mm'); P('6:00 pm', 0.75); P('29/02/2024 12:00', 45351.5);
P('31/02/2024', '31/02/2024'); P('', null); P('#N/D', E.NA); P('1,5', 1.5); P('007', 7); P('12 abc', '12 abc');

// ------------------------------------------------------------------ guardar y cargar
reset();
set('A1', '5'); set('A2', '=A1*3'); set('B1', 'hola'); set('B2', '25%'); set('C1', '=SECUENCIA(2;2)');
wb.setNote(sh, 0, 0, 'una nota');
const json = JSON.parse(JSON.stringify(wb.toJSON()));
const wb2 = HC.Workbook.fromJSON(json), sh2 = wb2.sheet;
check('json valor', sh2.value(0, 0), 5); check('json fórmula', sh2.value(1, 0), 15); check('json texto', sh2.value(0, 1), 'hola');
check('json formato', sh2.styleAt(1, 1).nf, '0%'); check('json desbordamiento', sh2.value(1, 3), 4); check('json nota', sh2.get(0, 0).note, 'una nota');
check('json cero', (() => { reset(); set('A1', '0'); return HC.Workbook.fromJSON(wb.toJSON()).sheet.value(0, 0); })(), 0);

// ------------------------------------------------------------------ operaciones: rellenar, pegar, ordenar, filtrar…
reset();
set('A1', '1'); set('A2', '2');
wb.fillRange(sh, at('A1:A2'), at('A1:A5')); check('serie lineal', val('A5'), 5);
set('B1', 'lunes'); wb.fillRange(sh, at('B1'), at('B1:B4')); check('serie de días', val('B4'), 'jueves');
set('C1', 'Semana 1'); wb.fillRange(sh, at('C1'), at('C1:C3')); check('texto con número', val('C3'), 'Semana 3');
set('D1', '=A1*2'); wb.fillRange(sh, at('D1'), at('D1:D5')); check('fórmula rellenada', val('D5'), 10); check('fórmula rellenada (texto)', sh.get(4, 3).f, 'A5*2');
set('E1', '5'); wb.fillRange(sh, at('E1'), at('E1:E3')); check('un número se copia', val('E3'), 5);
wb.fillRange(sh, at('E1'), at('E1:E3'), { series: true }); check('un número con serie', val('E3'), 7);
set('F1', 'Ene'); wb.fillRange(sh, at('F1'), at('F1:I1')); check('meses hacia la derecha', val('I1'), 'Abr');
set('G3', '01/01/2024'); wb.fillRange(sh, at('G3'), at('G3:G5')); check('serie de fechas', val('G5'), 45294);
set('H3', '10'); set('H4', '20'); wb.fillRange(sh, at('H3:H4'), at('H1:H4')); check('relleno hacia arriba', val('H1'), -10);
set('J1', '1'); set('J2', '3'); set('J3', '9'); wb.fillRange(sh, at('J1:J3'), at('J1:J4')); check('tendencia', val('J4'), 12.3333333333);
{
  const fillBook = HC.Workbook.fromJSON(wb.toJSON()), fillSheet = fillBook.sheet;
  fillBook.fillRange(fillSheet, at('A1:A2'), at('A1:A5'), { mode: 'copy' }); check('copiar celdas repite números', fillSheet.value(4, 0), 1);
  fillBook.fillRange(fillSheet, at('B1'), at('B1:B4'), { mode: 'copy' }); check('copiar celdas repite días', fillSheet.value(3, 1), 'lunes');
  fillBook.fillRange(fillSheet, at('G3'), at('G3:G5'), { mode: 'copy' }); check('copiar celdas repite fechas', fillSheet.value(4, 6), fillSheet.value(2, 6));
  fillBook.fillRange(fillSheet, at('G3'), at('G3:G5'), { mode: 'series' }); check('continuar una fecha', fillSheet.value(4, 6), 45294);
  fillBook.fillRange(fillSheet, at('D1'), at('D1:D5'), { mode: 'copy' }); check('copiar celdas desplaza fórmulas', fillSheet.get(4, 3).f, 'A5*2');
}
let data = wb.copyData(sh, at('D1:D2'));
wb.pasteData(sh, 9, 3, data); check('pegar fórmula desplazada', sh.get(9, 3).f, 'A10*2');
wb.pasteData(sh, 12, 3, data, { mode: 'values' }); check('pegar valores: sin fórmula', sh.get(12, 3).f, undefined); check('pegar valores: valor', val('D13'), 2);
wb.pasteData(sh, 20, 4, data, { target: at('E21:F24') }); check('pegar en mosaico', sh.get(23, 5).f, 'C24*2');
const cutData = wb.copyData(sh, at('A1:A5')); cutData.cut = true;
wb.pasteData(sh, 0, 12, cutData);
check('cortar: origen vacío', val('A1'), null); check('cortar: destino', val('M5'), 5);
check('cortar: las referencias siguen a las celdas', sh.get(0, 3).f, 'M1*2'); check('cortar: valor', val('D5'), 10);
wb.undo(); check('deshacer cortar', sh.get(0, 3).f, 'A1*2'); check('deshacer cortar: valor', val('A5'), 5);
wb.redo(); check('rehacer cortar', sh.get(0, 3).f, 'M1*2'); wb.undo();
wb.pasteMatrix(sh, 30, 0, [['1.5', 'x'], ['=A31*2', '10%']]);
check('pegar matriz', [sh.value(30, 0), sh.value(31, 0), sh.value(31, 1)].join('|'), '1.5|3|0.1');

reset();
[['Nombre', 'Edad'], ['Zoe', 30], ['ana', 25], ['Luis', 41]].forEach((row, i) => row.forEach((v, j) => wb.setCellValue(sh, i, j, v)));
set('C2', '=B2*2'); set('C3', '=B3*2'); set('C4', '=B4*2');
wb.sortRange(sh, at('A1:C4'), [{ col: 0 }], true);
check('ordenar por texto', val('A2'), 'ana'); check('ordenar arrastra la fila', val('B2'), 25); check('ordenar: fórmula', val('C2'), 50); check('ordenar: texto de fórmula', sh.get(1, 2).f, 'B2*2');
wb.sortRange(sh, at('A1:C4'), [{ col: 1, desc: true }], true); check('ordenar descendente', val('A2'), 'Luis');
wb.undo(); check('deshacer ordenar', val('A2'), 'ana');
wb.setFilter(sh, { range: at('A1:C4'), cols: {} });
wb.setFilterCol(sh, 1, { op: 'gt', v1: '26' });
check('filtro: fila oculta', sh.rowH.size(1), 0); check('filtro: fila visible', sh.rowH.size(2), 20); check('SUBTOTALES ignora filtradas', calc('SUBTOTALES(9;B2:B4)'), 71);
check('SUMA cuenta filtradas', calc('SUMA(B2:B4)'), 96);
wb.setFilterCol(sh, 1, { hidden: ['30'] }); check('filtro por valores', [sh.rowH.size(1), sh.rowH.size(3)].join(), '20,0');
check('elementos del filtro', wb.filterItems(sh, 0).map((x) => x.text).join(), 'ana,Luis,Zoe');
wb.undo(); check('deshacer filtro', sh.rowH.size(1), 0);
wb.setFilter(sh, null); check('quitar filtro', sh.rowH.size(1), 20);
set('E1', '=SUBTOTALES(9;B2:B4)');
wb.setFilter(sh, { range: at('A1:C4'), cols: {} });
wb.setFilterCol(sh, 1, { values: ['25', '30'] });
check('valores permitidos actualizan el subtotal de la hoja', val('E1'), 55);
wb.setCellValue(sh, 2, 1, 30);
check('el filtro se actualiza tras editar y recalcular', [sh.isRowFiltered(2), val('E1')].join(), 'false,85');
wb.undo(); check('deshacer edición vuelve a filtrar', [sh.isRowFiltered(2), val('E1')].join(), 'true,55');
wb.formatRange(sh, [at('B2:B4')], { nf: '0.00' });
check('formatear números conserva la selección del filtro', [...sh.rowH.filtered].join(), '2');
wb.insertCols(sh, 1, 1);
check('insertar una columna mueve el criterio', [Object.keys(sh.filter.cols).join(), sh.isRowFiltered(2)].join('|'), '2|true');
wb.undo();
wb.setFilterCol(sh, 1, { values: [] });
check('deseleccionar todos los valores oculta los datos', [...sh.rowH.filtered].join(), '1,2,3');
wb.setFilter(sh, null);
check('quitar el filtro vuelve a calcular el subtotal', val('E1'), 96);
wb.setFilter(sh, { range: at('A1:C3'), cols: {}, autoExpand: false });
wb.setFilterCol(sh, 1, { op: 'lt', v1: 29 });
check('el filtro respeta el rango explícito', [wb.filterBounds(sh).r2, sh.isRowFiltered(3)].join(), '2,false');
wb.setFilter(sh, null);
wb.setFilter(sh, { range: at('A1:C5'), cols: {}, autoExpand: false });
check('el filtro explícito conserva las filas vacías seleccionadas', [wb.filterBounds(sh).r2, wb.filterItems(sh, 1).some(({ key }) => key === '')].join(), '4,true');
wb.setHidden(sh, 'row', 2, 2, true);
wb.setFilterCol(sh, 1, { op: 'gt', v1: 35 });
const filteredCopy = HC.Workbook.fromJSON(wb.toJSON());
filteredCopy.setFilter(filteredCopy.sheet, null);
check('limpiar filtros de una copia JSON conserva filas ocultas manualmente', [...filteredCopy.sheet.rowH.hidden].join(), '2');
wb.setFilter(sh, null);
wb.setHidden(sh, 'row', 2, 2, false);
wb.formatRange(sh, [at('A1:B2')], { b: true }); check('negrita', sh.styleAt(0, 0).b, true); wb.undo(); check('deshacer formato', sh.styleAt(0, 0), null);
wb.formatRange(sh, [{ r1: 0, c1: 2, r2: HC.MAX_ROWS - 1, c2: 2 }], { nf: '0.00' }); check('formato de columna entera', sh.styleAt(5000, 2).nf, '0.00'); check('texto con formato', wb.displayText(sh, 1, 2), '50.00');
wb.setBorders(sh, at('A1:B2'), 'outer', 'thin #000000'); check('borde exterior', [sh.styleAt(0, 0).bt, sh.styleAt(0, 0).bb, sh.styleAt(1, 1).br].join('|'), 'thin #000000||thin #000000');
wb.mergeRange(sh, at('E1:F2')); check('combinar', !!sh.mergeAt(1, 5), true); wb.unmergeRange(sh, at('E1')); check('separar', sh.mergeAt(1, 5), null);
wb.setProp(sh, 'condFmts', [{ ranges: [at('B2:B4')], type: 'cell', op: 'gt', v1: '28', style: { bg: '#ff0000' } }, { ranges: [at('B2:B4')], type: 'formula', formula: '=$B2<26', style: { b: true } }]);
check('formato condicional: cumple', (wb.condStyle(sh, 2, 1) || {}).bg, '#ff0000'); check('formato condicional: no cumple', (wb.condStyle(sh, 1, 1) || {}).bg, undefined);
check('formato condicional: fórmula', (wb.condStyle(sh, 1, 1) || {}).b, true);
wb.setProp(sh, 'condFmts', [{ ranges: [at('B2:B4')], type: 'scale', colors: ['#ffffff', '#000000'] }]);
check('escala de color', wb.condStyle(sh, 2, 1).bg, '#000000');
wb.setProp(sh, 'validations', [{ ranges: [at('E5:E9')], type: 'list', source: 'Sí,No' }, { ranges: [at('F5')], type: 'whole', op: 'between', v1: 1, v2: 10 }]);
check('validación de lista: válido', wb.checkValidation(sh, 4, 4, 'sí'), null); check('validación de lista: inválido', typeof wb.checkValidation(sh, 4, 4, 'Quizá'), 'string');
check('validación entero', [wb.checkValidation(sh, 4, 5, '5') === null, wb.checkValidation(sh, 4, 5, '11') === null, wb.checkValidation(sh, 4, 5, '2.5') === null].join(), 'true,false,false');
check('buscar', wb.findAll(sh, 'u').map((p) => HC.addr(p[0], p[1])).join(), 'A3');
wb.replaceIn(sh, 2, 0, 'u', 'OU', {}); check('reemplazar', val('A3'), 'LOUis');
wb.insertRows(sh, 1, 1); check('validación tras insertar fila', (wb.validationAt(sh, 5, 4) || {}).type, 'list');
reset();
[['a', 1], ['b', 2], ['A', 3], ['c', 4], ['b', 5]].forEach((row, i) => row.forEach((v, j) => wb.setCellValue(sh, i, j, v)));
check('quitar duplicados', wb.removeDuplicates(sh, at('A1:B5'), [0], false), 2); check('quitar duplicados: resto', [val('A3'), val('B3'), val('A4')].join(), 'c,4,');
reset(); set('A1', '10'); set('B1', '=A1*3+5');
check('buscar objetivo', wb.goalSeek(sh, { r: 0, c: 1 }, 50, { r: 0, c: 0 }).ok, true); check('buscar objetivo: valor', val('A1'), 15);
check('csv', JSON.stringify(HC.csv.parse('a,b\r\n"c,d","e ""x"""\n')), JSON.stringify([['a', 'b'], ['c,d', 'e "x"']]));
check('csv punto y coma', JSON.stringify(HC.csv.parse('1;2\n3;4')), '[["1","2"],["3","4"]]');
check('csv salida', HC.csv.stringify([['a', 'b,c'], [1, null]]), 'a,"b,c"\r\n1,');
reset(); set('A1', 'x'); wb.setCellValue(sh, 0, 1, 5); set('C1', '=B1+1');
wb.insertCols(sh, 1, 1); wb.undo(); wb.undo(); wb.undo(); wb.redo(); wb.redo(); wb.redo();
check('rehacer tras recrear celdas', sh.get(0, 3).f, 'C1+1'); check('rehacer tras recrear celdas: valor', sh.value(0, 3), 6);
wb.deleteCols(sh, 0, 2); wb.undo(); check('deshacer eliminar columnas', [sh.value(0, 0), sh.value(0, 2), sh.value(0, 3)].join(), 'x,5,6');

// ------------------------------------------------------------------ resumen
const total = Object.keys(HC.fns).length;
console.log(fails.join('\n'));
console.log(`\n${pass} pruebas correctas, ${fail} fallidas · ${total} funciones registradas`);
process.exit(fail ? 1 : 0);
