import { addMatrices, multiplyMatrices, transpose, assertMatricesDimensionMatch, assertMatricesCompatible } from "./matrix-operations";
import { fromJSONFile, jsonFilePath, randomizeMatrix, randomizeVector } from "./utils";
import { vectorSum, dotProduct } from "./vector-operations";
import { Matrix, Vector } from "./types";
import { displayVector, displayMatrix } from "./display";

// HINT: (w zaleności od wybranego kierunku implementacji) może być mnożenie macierzy przez wektory - tę operację będzie trzeba zaimplementować 😉 
// ale nie jest to konieczne 😎

// HINT: w mnożeniu macierzy kolejność ma znaczenie - bo w zależności od kolejności albo wymiary obydwu składników pasują do siebie albo nie.

// HINT: wstań od komputera i przemyśl problem. Serio. Zastanów się, ile linijek wystarczy aby podać rozwiązanie :)
// (traktując "linijkę" jako pojedynczą operację na tensorach) 😎

// PROŚBA: jeśli znasz rozwiązanie, to nie spamuj discorda - a przynajmniej nie od razu. Pozwól innym pomóżdżyć 😎

// const { WK_Matrix, WQ_Matrix, X_Input_Matrix } = fromJSONFile(jsonFilePath('case-1.json'));
// const { WK_Matrix, WQ_Matrix, X_Input_Matrix } = fromJSONFile(jsonFilePath('case-2.json'));
// const { WK_Matrix, WQ_Matrix, X_Input_Matrix } = fromJSONFile(jsonFilePath('case-3.json'));
const { WK_Matrix, WQ_Matrix, X_Input_Matrix } = fromJSONFile(jsonFilePath('case-4.json'));

console.log('WK_Matrix');
console.log(displayMatrix(WK_Matrix, -1));
console.log('WQ_Matrix');
console.log(displayMatrix(WQ_Matrix, -1));
console.log('X_Input_Matrix');
console.log(displayMatrix(X_Input_Matrix, -1));

const x1_vector = X_Input_Matrix[0];
console.log('x1_vector');
console.log(displayVector(x1_vector, -1));

console.log('\n=== OBLICZANIE ATTENTION SCORE MATRIX (S) ===\n');

// Krok 1: Q = X × WQ (Query - "pytania" od każdego tokenu)
const Q_Matrix = multiplyMatrices(X_Input_Matrix, WQ_Matrix);
console.log('Q_Matrix (Query) = X × WQ:');
console.log(displayMatrix(Q_Matrix, -1));

// Krok 2: K = X × WK (Key - "klucze/odpowiedzi" od każdego tokenu)
const K_Matrix = multiplyMatrices(X_Input_Matrix, WK_Matrix);
console.log('K_Matrix (Key) = X × WK:');
console.log(displayMatrix(K_Matrix, -1));

// Krok 3: K^T (transpozycja macierzy Key)
const K_Transposed = transpose(K_Matrix);
console.log('K^T (transponowana K):');
console.log(displayMatrix(K_Transposed, -1));

// Krok 4: S = Q × K^T (Attention Score Matrix)
const S_Matrix = multiplyMatrices(Q_Matrix, K_Transposed);
console.log('\n🎯 ATTENTION SCORE MATRIX (S) = Q × K^T:');
console.log(displayMatrix(S_Matrix, -1));

console.log('\n=== INTERPRETACJA ===');
console.log('Każdy wiersz pokazuje, jak bardzo dany token "zwraca uwagę" na wszystkie tokeny:');
S_Matrix.forEach((row, i) => {
    console.log(`Token #${i}: [${row.map(v => v.toFixed(2)).join(', ')}]`);
});
