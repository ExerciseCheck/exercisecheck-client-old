import sys
import json
import numpy as np

def read_in():
	lines = sys.stdin.readlines()
	return json.loads(lines[0])
	
def affine_transformation():
	# Read x, y from stdin
	x, y = read_in()
	x = np.array(x)
	y = np.array(y)
	
	
	pad = lambda x: np.hstack([x, np.ones((x.shape[0], 1))])
	unpad = lambda x: x[:, :-1]
	
	# Use numpy to pad them so we can have affine transformation and translation at the same time
	pad_x = x#pad(x)
	pad_y = y#pad(y)
	
	# Calculate the least squares for pad_x and pad_y
	A, _, _, _ = np.linalg.lstsq(pad_x, pad_y, rcond=None)
	
	# Use A to calculate error
	err = np.sum((pad_x @ A - pad_y)**2)
	
	A[np.abs(A) < 1e-10] = 0
	
	# output the result in json
	print(json.dumps([float(err), A.tolist()]))
	
if __name__ == "__main__":
	affine_transformation()